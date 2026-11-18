#!/usr/bin/env python3
"""H1 PM handoff guard. Standard library only; GitHub GETs only; no file writes.

The canonical engine is copied byte-for-byte and pinned in .handoff/profile.json.
PASS applies only to the reported checks. Business meaning, approvals, deployment,
and completeness of a handoff always require a human/agent review.
"""

import argparse
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, Request, build_opener

POLICY = "H1"
MAX_RESPONSE_BYTES = 1_000_000
MAX_ENTRY_CHARS = 8000
MAX_ENTRY_FILE_CHARS = 2600
MAX_CURRENT_CHARS = 6000
MARKERS = ("HANDOFF_STATE_V1", "A2W_HANDOFF_V1")
REPO_PATTERN = r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}"
SHA_PATTERN = r"[0-9a-f]{40}"


class GuardError(ValueError):
    """A safe diagnostic, without response bodies, credentials, or exception text."""


def require(condition, message):
    if not condition:
        raise GuardError(message)


def integer(value, minimum=0, maximum=None):
    return type(value) is int and value >= minimum and (maximum is None or value <= maximum)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate JSON key")
        result[key] = value
    return result


def parse_json(content, label):
    try:
        return json.loads(content, object_pairs_hook=unique_object)
    except (json.JSONDecodeError, UnicodeError, TypeError, RecursionError):
        raise GuardError(label + " is not valid JSON") from None


def timestamp(value, label):
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        require(result.tzinfo is not None, label + " needs a timezone")
        return result.astimezone(timezone.utc)
    except (AttributeError, ValueError, TypeError, OverflowError):
        raise GuardError(label + " must be an ISO timestamp with timezone") from None


def safe_relative(value):
    require(isinstance(value, str) and 0 < len(value) <= 400
            and "\\" not in value and ":" not in value
            and all(ord(c) >= 32 and ord(c) != 127 for c in value), "unsafe relative path")
    parts = value.split("/")
    require(not PurePosixPath(value).is_absolute()
            and all(p not in ("", ".", "..") for p in parts), "unsafe relative path")
    return value


def safe_file(root, relative):
    relative = safe_relative(relative)
    root = Path(root)
    require(root.is_dir() and not root.is_symlink(), "root must be a real directory")
    base = root.resolve()
    path = base
    for part in relative.split("/"):
        path = path / part
        require(not path.is_symlink(), "symlink paths are not allowed")
    require(path.resolve().is_relative_to(base), "path escapes repository root")
    require(path.is_file(), "required file is missing")
    return path


def read_text(path, max_bytes=MAX_RESPONSE_BYTES):
    try:
        with Path(path).open("rb") as stream:
            data = stream.read(max_bytes + 1)
        require(len(data) <= max_bytes, "file exceeds byte budget")
        return data.decode("utf-8")
    except (OSError, UnicodeError):
        raise GuardError("cannot read required UTF-8 file") from None


def file_sha256(path):
    try:
        digest = hashlib.sha256()
        with Path(path).open("rb") as stream:
            for chunk in iter(lambda: stream.read(65536), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except OSError:
        raise GuardError("cannot read file for preservation check") from None


def valid_repository(value):
    return isinstance(value, str) and re.fullmatch(REPO_PATTERN, value) is not None


def source_kind(current):
    if current["kind"] == "external":
        return "issue" if "number" in current else "file"
    return current["kind"]


def evidence_issue_number(current):
    """Only a primary issue or an explicitly pinned file-evidence issue may supply comments."""
    return current["number"] if source_kind(current) == "issue" else current.get("evidence_issue_number")


def validate_profile(profile):
    require(isinstance(profile, dict), "profile must be an object")
    require(type(profile.get("schema_version")) is int and profile["schema_version"] == 1,
            "unsupported profile schema")
    require(profile.get("policy_version") == POLICY, "unsupported handoff policy")
    project = profile.get("project")
    require(isinstance(project, str) and 0 < len(project) <= 100
            and project == project.strip() and not re.search(r"[\r\n\x00:]", project),
            "invalid project identifier")
    require(valid_repository(profile.get("repository")), "invalid repository identifier")
    branch = profile.get("branch")
    require(isinstance(branch, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,127}", branch)
            and ".." not in branch and "//" not in branch and not branch.endswith(("/", ".", ".lock")),
            "invalid branch")
    require(isinstance(profile.get("engine_sha256"), str)
            and re.fullmatch(r"[0-9a-f]{64}", profile["engine_sha256"]), "invalid engine pin")
    entries = profile.get("entrypoints")
    require(isinstance(entries, list) and 1 <= len(entries) <= 5,
            "profile requires 1 to 5 startup entrypoints")
    seen = set()
    for entry in entries:
        require(isinstance(entry, dict), "invalid startup entrypoint")
        name = safe_relative(entry.get("path"))
        require(name not in seen, "duplicate startup entrypoint")
        seen.add(name)
        require(integer(entry.get("max_chars"), 1, MAX_ENTRY_FILE_CHARS), "invalid entrypoint budget")
    require(integer(profile.get("entry_budget_chars"), 1, MAX_ENTRY_CHARS), "invalid total startup budget")
    current = profile.get("current")
    require(isinstance(current, dict) and current.get("kind") in ("issue", "file", "external", "unassigned"),
            "invalid CURRENT source kind")
    require(valid_repository(current.get("repository")), "invalid CURRENT repository")
    require(integer(current.get("max_chars"), 1, MAX_CURRENT_CHARS), "invalid CURRENT budget")
    require(current.get("metadata_marker") in (None,) + MARKERS, "unsupported CURRENT metadata marker")
    if "project" in current:
        require(isinstance(current["project"], str) and 0 < len(current["project"]) <= 100
                and not re.search(r"[\r\n\x00:]", current["project"]), "invalid CURRENT project")
    if current["kind"] == "external":
        require(current["repository"] != profile["repository"], "external source must name a different repository")
        require(bool(current.get("project")), "external source must explicitly name its project")
        require(("number" in current) != ("path" in current), "external source requires one issue or file")
    else:
        require(current["repository"] == profile["repository"], "cross-repository CURRENT requires external kind")
        require(current.get("project", project) == project, "local CURRENT project mismatch")
    kind = source_kind(current)
    if kind == "issue":
        require(integer(current.get("number"), 1) and "path" not in current, "invalid CURRENT issue")
    elif kind == "file":
        safe_relative(current.get("path"))
        require("number" not in current, "file CURRENT cannot also name an issue")
    else:
        require("number" not in current and "path" not in current
                and not current.get("metadata_marker"), "unassigned CURRENT cannot name a source")
    if "evidence_issue_number" in current:
        require(kind == "file" and integer(current["evidence_issue_number"], 1),
                "evidence_issue_number requires a file CURRENT and a positive issue number")
    archives = profile.get("archive_checks", [])
    require(isinstance(archives, list), "archive checks must be a list")
    seen = set()
    for archive in archives:
        require(isinstance(archive, dict), "invalid archive check")
        name = safe_relative(archive.get("path"))
        require(name not in seen, "duplicate archive check")
        seen.add(name)
        require(isinstance(archive.get("sha256"), str) and re.fullmatch(r"[0-9a-f]{64}", archive["sha256"]),
                "invalid archive preservation hash")
    return profile


def parse_current_body(profile, body):
    current = profile["current"]
    require(isinstance(body, str) and 0 < len(body) <= current["max_chars"],
            "CURRENT body is missing or exceeds its character budget")
    visible = re.sub(r"<!--.*?-->", "", body, flags=re.S)
    require(re.search(r"\w", visible) is not None, "CURRENT needs visible content outside metadata")
    marker = current.get("metadata_marker")
    if not marker:
        return None
    openings = re.findall(r"<!--\s*(HANDOFF_STATE_V1|A2W_HANDOFF_V1)\b", body)
    require(openings == [marker], "CURRENT requires exactly one configured metadata marker")
    match = re.search(r"<!--\s*" + re.escape(marker) + r"\s*\n(.*?)\n\s*-->", body, re.S)
    require(match is not None, "invalid CURRENT metadata block")
    meta = parse_json(match.group(1), "CURRENT metadata")
    require(isinstance(meta, dict), "CURRENT metadata must be an object")
    expected = {"schema_version": 1, "project": current.get("project", profile["project"]),
                "repository": current["repository"]}
    for key, value in expected.items():
        require(type(meta.get(key)) is type(value) and meta[key] == value,
                "CURRENT metadata identity mismatch: " + key)
    if "issue_number" in meta or marker == "A2W_HANDOFF_V1":
        require(source_kind(current) == "issue" and type(meta.get("issue_number")) is int
                and meta["issue_number"] == current["number"], "CURRENT metadata issue mismatch")
    if "path" in meta:
        require(source_kind(current) == "file" and meta["path"] == current["path"], "CURRENT metadata file mismatch")
    if "evidence_issue_number" in meta:
        require(source_kind(current) == "file" and integer(meta["evidence_issue_number"], 1)
                and meta["evidence_issue_number"] == current.get("evidence_issue_number"),
                "CURRENT metadata evidence issue differs from its explicit profile pin")
    refreshed = timestamp(meta.get("refreshed_at"), "refreshed_at")
    require(refreshed <= datetime.now(timezone.utc) + timedelta(minutes=5), "refreshed_at is too far in the future")
    if marker == "A2W_HANDOFF_V1":
        require(all(key in meta for key in ("verified_main_sha", "observed_comment_count", "evidence_comment_ids",
                    "pull_requests", "last_evidence_comment_id", "last_evidence_updated_at")),
                "A2W metadata lacks existing verification fields")
    if "verified_main_sha" in meta:
        require(isinstance(meta["verified_main_sha"], str) and re.fullmatch(SHA_PATTERN, meta["verified_main_sha"]),
                "verified_main_sha must be a full lowercase commit SHA")
    if "observed_comment_count" in meta:
        require(evidence_issue_number(current) is not None and integer(meta["observed_comment_count"]),
                "observed_comment_count requires an explicitly pinned issue and a nonnegative integer")
    ids = meta.get("evidence_comment_ids", [])
    require(isinstance(ids, list) and len(ids) <= 3 and all(integer(i, 1) for i in ids)
            and len(set(ids)) == len(ids), "select at most 3 unique positive comment IDs")
    require(not ids or evidence_issue_number(current) is not None,
            "file CURRENT comments require an explicit evidence issue pin")
    last_id = meta.get("last_evidence_comment_id")
    if "last_evidence_comment_id" in meta or "last_evidence_updated_at" in meta:
        require(integer(last_id, 1) and last_id in ids, "last evidence must be selected")
        last_time = timestamp(meta.get("last_evidence_updated_at"), "last_evidence_updated_at")
        require(last_time <= refreshed, "last evidence is newer than the handoff refresh")
    prs = meta.get("pull_requests", {})
    require(isinstance(prs, dict) and len(prs) <= 3
            and all(re.fullmatch(r"[1-9]\d*", n) and s in ("open", "closed", "merged") for n, s in prs.items()),
            "select at most 3 explicit PR states")
    plain = body.replace("`", "").replace("**", "")
    for number, state in prs.items():
        if state == "merged":
            require(not re.search(r"PR\s*#\s*" + number + r"\s*(?:OPEN\b|미병합|병합\s*대기)", plain, re.I),
                    "CURRENT prose contradicts a merged PR")
    return meta


def check_static(root, engine_path=None):
    profile_path = safe_file(root, ".handoff/profile.json")
    profile = validate_profile(parse_json(read_text(profile_path), "profile"))
    actual_engine = Path(engine_path) if engine_path is not None else Path(__file__)
    require(file_sha256(actual_engine) == profile["engine_sha256"], "engine differs from the pinned canonical copy")
    counts, bodies = {}, []
    for entry in profile["entrypoints"]:
        body = read_text(safe_file(root, entry["path"]), entry["max_chars"] * 4)
        require(0 < len(body) <= entry["max_chars"], "startup file exceeds its character budget or is empty")
        for key, expected in {"PROJECT": profile["project"], "REPOSITORY": profile["repository"], "HANDOFF_POLICY": POLICY}.items():
            values = re.findall(r"(?m)^[ \t]*" + key + r"[ \t]*:[ \t]*([^\r\n]*)$", body)
            require(len(values) == 1 and values[0].strip() == expected, "startup requires one correct " + key + " header")
        counts[entry["path"]] = len(body)
        bodies.append(body)
    require(sum(counts.values()) <= profile["entry_budget_chars"], "total startup character budget exceeded")
    current = profile["current"]
    if current["kind"] == "unassigned":
        require(any(re.search(r"(?m)^CURRENT:[ \t]*UNKNOWN[ \t]*$", b) for b in bodies),
                "unassigned CURRENT must visibly declare CURRENT: UNKNOWN in a startup file")
    if current["kind"] == "file":
        parse_current_body(profile, read_text(safe_file(root, current["path"]), current["max_chars"] * 4))
    for archive in profile.get("archive_checks", []):
        require(file_sha256(safe_file(root, archive["path"])) == archive["sha256"], "preserved archive content changed")
    return profile, {"startup_characters": counts, "startup_total_characters": sum(counts.values()),
                     "archives_verified": len(profile.get("archive_checks", [])), "engine_pin_verified": True,
                     "current": "UNKNOWN" if current["kind"] == "unassigned" else "NOT_LIVE_VERIFIED"}


def validate_issue_identity(issue, repository, number):
    api = "https://api.github.com/repos/" + repository
    web = "https://github.com/" + repository
    require(isinstance(issue, dict) and "pull_request" not in issue, "CURRENT evidence is not an issue object")
    require(type(issue.get("number")) is int and issue["number"] == number
            and issue.get("repository_url") == api and issue.get("html_url") == web + "/issues/" + str(number),
            "wrong pinned issue identity")
    require(integer(issue.get("comments")), "pinned issue comment count is invalid")
    require(issue.get("body") is None or isinstance(issue["body"], str), "pinned issue body is invalid")
    timestamp(issue.get("updated_at"), "issue updated_at")
    return issue


def source_data(profile, source):
    current = profile["current"]
    require(isinstance(source, dict) and source.get("repository") == current["repository"], "snapshot source repository mismatch")
    kind = source_kind(current)
    require(source.get("kind") == kind and kind in ("issue", "file"), "snapshot source kind mismatch")
    if kind == "issue":
        issue = validate_issue_identity(source.get("issue"), current["repository"], current["number"])
        body = issue.get("body")
    else:
        file = source.get("file")
        require(isinstance(file, dict) and file.get("path") == current["path"], "wrong CURRENT file identity")
        body = file.get("content")
        require(isinstance(body, str), "CURRENT file content is missing")
        raw = body.encode("utf-8")
        blob_sha = hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()
        require(file.get("sha") == blob_sha, "CURRENT file blob hash does not match its content")
    return body, parse_current_body(profile, body)


def validate_snapshot(profile, snapshot):
    validate_profile(profile)
    require(profile["current"]["kind"] != "unassigned", "CURRENT is UNKNOWN; no current source is assigned")
    require(isinstance(snapshot, dict), "snapshot must be an object")
    body, meta = source_data(profile, snapshot.get("source"))
    main_sha = snapshot.get("main_sha")
    require(isinstance(main_sha, str) and re.fullmatch(SHA_PATTERN, main_sha), "snapshot lacks a valid observed main SHA")
    checks = ["source_identity", "body_budget", "visible_content"]
    omitted = ["business_meaning", "approval_validity", "deployment_state", "unselected_evidence"]
    current = profile["current"]
    repo = current["repository"]
    api, web = "https://api.github.com/repos/" + repo, "https://github.com/" + repo
    issue_number = evidence_issue_number(current)
    if source_kind(current) == "file" and issue_number is not None:
        issue = validate_issue_identity(snapshot.get("evidence_issue"), repo, issue_number)
        checks.append("evidence_issue_identity")
    else:
        require("evidence_issue" not in snapshot, "snapshot contains an unpinned or duplicate evidence issue")
        issue = snapshot["source"].get("issue")
    if meta:
        checks.extend(["metadata_identity", "refresh_timestamp_not_future"])
    else:
        omitted.append("metadata_identity")
    meta = meta or {}
    if "verified_main_sha" in meta:
        require(main_sha == meta["verified_main_sha"], "main changed; refresh CURRENT from bounded evidence")
        checks.append("main_sha_match")
    else:
        omitted.append("main_freshness")
    if "observed_comment_count" in meta:
        require(issue["comments"] == meta["observed_comment_count"],
                "comment count changed; inspect a bounded delta and refresh CURRENT")
        checks.append("comment_count_match")
    elif issue_number is not None:
        omitted.append("comment_count_freshness")
    prs = snapshot.get("pull_requests", {})
    expected_prs = meta.get("pull_requests", {})
    require(isinstance(prs, dict) and len(prs) <= 3 and set(prs) == set(expected_prs), "PR snapshot must contain exactly the selected PRs")
    pr_results = []
    for number, expected in expected_prs.items():
        pr = prs[number]
        require(isinstance(pr, dict) and type(pr.get("number")) is int and pr["number"] == int(number)
                and pr.get("html_url") == web + "/pull/" + number
                and isinstance(pr.get("base"), dict) and isinstance(pr["base"].get("repo"), dict)
                and pr["base"]["repo"].get("full_name") == repo, "wrong selected PR identity")
        merged = pr.get("merged") is True or bool(pr.get("merged_at"))
        require(pr.get("state") in ("open", "closed") and not (merged and pr["state"] != "closed"), "invalid selected PR state")
        actual = "merged" if merged else pr["state"]
        require(actual == expected, "selected PR state changed; refresh CURRENT")
        pr_results.append({"number": int(number), "state": actual, "url": pr["html_url"], "title": str(pr.get("title", ""))[:160]})
    (checks if expected_prs else omitted).append("selected_pr_states")
    comments = snapshot.get("comments", [])
    ids = meta.get("evidence_comment_ids", [])
    require(isinstance(comments, list) and len(comments) <= 3
            and all(isinstance(c, dict) and integer(c.get("id"), 1) for c in comments), "invalid bounded comment evidence")
    by_id = {c["id"]: c for c in comments}
    require(len(by_id) == len(comments) and set(by_id) == set(ids), "comment snapshot must contain exactly the selected comments")
    evidence = []
    for comment_id in ids:
        comment = by_id[comment_id]
        issue_path = "/issues/" + str(issue_number)
        expected_url = web + issue_path + "#issuecomment-" + str(comment_id)
        require(comment.get("issue_url") == api + issue_path and comment.get("html_url") == expected_url,
                "selected comment belongs to a different issue")
        updated = timestamp(comment.get("updated_at"), "comment updated_at")
        require(updated <= timestamp(meta["refreshed_at"], "refreshed_at"), "selected evidence was edited after CURRENT refresh")
        if comment_id == meta.get("last_evidence_comment_id"):
            require(updated == timestamp(meta["last_evidence_updated_at"], "last_evidence_updated_at"), "last evidence timestamp differs")
        lines = str(comment.get("body", "")).strip().splitlines()
        evidence.append({"id": comment_id, "title": lines[0][:160] if lines else "",
                         "url": expected_url, "updated_at": comment["updated_at"]})
    (checks if ids else omitted).append("selected_comment_timestamps")
    freshness = any(c in checks for c in ("main_sha_match", "comment_count_match", "selected_pr_states", "selected_comment_timestamps"))
    result = {"project": profile["project"], "repository": profile["repository"],
            "current_project": current.get("project", profile["project"]), "current_repository": repo,
            "current": "BOUNDED_EVIDENCE_CHECKED" if freshness else "IDENTITY_AND_BUDGET_ONLY",
            "current_characters": len(body), "observed_main_sha": main_sha,
            "checks_verified": checks, "not_verified": omitted,
            "pull_requests": pr_results, "evidence": evidence}
    if source_kind(current) == "file" and issue_number is not None:
        result["evidence_issue_url"] = web + "/issues/" + str(issue_number)
    return result


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise GuardError("GitHub redirect rejected")


class GitHubClient:
    def __init__(self, profile, token=None):
        validate_profile(profile)
        current = profile["current"]
        require(current["kind"] in ("issue", "file"),
                "live CURRENT is unverified: external/unassigned sources require an authorized snapshot or source assignment")
        self.profile, self.current = profile, current
        self.api = "https://api.github.com/repos/" + current["repository"]
        self.branch_path = "/branches/" + quote(profile["branch"], safe="")
        self.allowed = {self.branch_path}
        if current["kind"] == "issue":
            self.allowed.add("/issues/" + str(current["number"]))
        elif "evidence_issue_number" in current:
            self.allowed.add("/issues/" + str(current["evidence_issue_number"]))
        self.token = token if token is not None else os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
        self.opener = build_opener(NoRedirect())

    def allow_evidence(self, meta):
        self.allowed.update("/pulls/" + n for n in meta.get("pull_requests", {}))
        self.allowed.update("/issues/comments/" + str(n) for n in meta.get("evidence_comment_ids", []))

    def allow_file(self, main_sha):
        require(re.fullmatch(SHA_PATTERN, main_sha) is not None, "invalid observed main SHA")
        path = "/contents/" + quote(self.current["path"], safe="/") + "?ref=" + main_sha
        self.allowed.add(path)
        return path

    def get(self, path):
        require(path in self.allowed, "GitHub endpoint is outside the bounded allowlist")
        url = self.api + path
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "handoff-guard-H1"}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        try:
            with self.opener.open(Request(url, headers=headers, method="GET"), timeout=15) as response:
                require(response.geturl() == url, "GitHub response URL changed")
                data = response.read(MAX_RESPONSE_BYTES + 1)
            require(len(data) <= MAX_RESPONSE_BYTES, "GitHub response exceeds byte budget")
            result = parse_json(data, "GitHub response")
            require(isinstance(result, dict), "GitHub response is not an object")
            return result
        except HTTPError as error:
            raise GuardError("GitHub read failed (HTTP " + str(error.code) + "); live CURRENT not verified") from None
        except GuardError:
            raise
        except (URLError, TimeoutError, OSError, UnicodeError, ValueError, TypeError):
            raise GuardError("GitHub read failed; live CURRENT not verified") from None


def branch_sha(branch):
    require(isinstance(branch, dict) and isinstance(branch.get("commit"), dict), "branch response lacks a commit")
    sha = branch["commit"].get("sha")
    require(isinstance(sha, str) and re.fullmatch(SHA_PATTERN, sha), "branch response lacks a valid commit SHA")
    return sha


def contents_file(response, expected_path):
    require(isinstance(response, dict) and response.get("type") == "file"
            and response.get("path") == expected_path and response.get("encoding") == "base64",
            "wrong CURRENT contents response")
    try:
        encoded = response.get("content")
        require(isinstance(encoded, str), "CURRENT contents response lacks content")
        content = base64.b64decode("".join(encoded.split()), validate=True).decode("utf-8")
    except (ValueError, UnicodeError, TypeError):
        raise GuardError("CURRENT contents response is not valid UTF-8 base64") from None
    return {"path": expected_path, "content": content, "sha": response.get("sha")}


def fetch_snapshot(profile, client=None):
    validate_profile(profile)
    current = profile["current"]
    require(current["kind"] in ("issue", "file"),
            "live CURRENT is unverified: external/unassigned source needs an authorized snapshot or assignment")
    client = client if client is not None else GitHubClient(profile)
    branch_path = "/branches/" + quote(profile["branch"], safe="")
    main_sha = branch_sha(client.get(branch_path))
    kind = current["kind"]
    if kind == "issue":
        path = "/issues/" + str(current["number"])
        source = {"kind": kind, "repository": current["repository"], "issue": client.get(path)}
    else:
        path = client.allow_file(main_sha)
        source = {"kind": kind, "repository": current["repository"], "file": contents_file(client.get(path), current["path"])}
    _, meta = source_data(profile, source)
    meta = meta or {}
    evidence_issue = None
    if kind == "file" and "evidence_issue_number" in current:
        evidence_path = "/issues/" + str(current["evidence_issue_number"])
        evidence_issue = validate_issue_identity(client.get(evidence_path), current["repository"], current["evidence_issue_number"])
    client.allow_evidence(meta)
    snapshot = {"source": source, "main_sha": main_sha,
                "pull_requests": {n: client.get("/pulls/" + n) for n in meta.get("pull_requests", {})},
                "comments": [client.get("/issues/comments/" + str(n)) for n in meta.get("evidence_comment_ids", [])]}
    if evidence_issue is not None:
        snapshot["evidence_issue"] = evidence_issue
    validate_snapshot(profile, snapshot)
    if kind == "issue":
        readback = client.get(path)
        source_data(profile, {"kind": kind, "repository": current["repository"], "issue": readback})
        require(all(readback.get(k) == source["issue"].get(k) for k in ("body", "updated_at", "comments")),
                "CURRENT issue changed during the read; review fresh state before retrying")
    else:
        readback = contents_file(client.get(path), current["path"])
        require(readback == source["file"], "CURRENT file changed during the read")
        if "evidence_issue_number" in current:
            readback_issue = validate_issue_identity(client.get(evidence_path), current["repository"], current["evidence_issue_number"])
            require(all(readback_issue.get(k) == snapshot["evidence_issue"].get(k) for k in ("body", "updated_at", "comments")),
                    "pinned evidence issue changed during the read; refresh file CURRENT before retrying")
    require(branch_sha(client.get(branch_path)) == main_sha, "main changed during the read; review fresh state before retrying")
    return snapshot


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--static", action="store_true")
    mode.add_argument("--live", action="store_true")
    mode.add_argument("--snapshot", type=Path)
    parser.add_argument("--packet", action="store_true", help="include bounded CURRENT text, never full comment bodies")
    args = parser.parse_args(argv)
    try:
        require(not (args.static and args.packet), "--packet requires --snapshot or --live")
        profile, result = check_static(args.root)
        result.update({"status": "PASS", "policy": POLICY, "project": profile["project"], "repository": profile["repository"]})
        if args.static:
            result.update({"mode": "static", "verification": "local identity, budgets, engine pin and archive hashes only; live CURRENT NOT VERIFIED"})
        else:
            snapshot = parse_json(read_text(args.snapshot), "snapshot") if args.snapshot else fetch_snapshot(profile)
            result.update(validate_snapshot(profile, snapshot))
            result.update({"mode": "snapshot" if args.snapshot else "live",
                           "verification": "provided snapshot only; live GitHub NOT RUN" if args.snapshot else "bounded read-only GitHub evidence, with source/evidence/main readback"})
            if args.packet:
                result["current_body"] = source_data(profile, snapshot["source"])[0]
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except GuardError as error:
        print("FAIL: " + str(error), file=sys.stderr)
        return 1
    except (OSError, ValueError, TypeError, KeyError, OverflowError):
        print("FAIL: malformed or unreadable handoff input; CURRENT not verified", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
