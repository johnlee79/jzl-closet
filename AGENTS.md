# JZL CLOSET 작업·검수 안내

PROJECT: JZL_CLOSET
REPOSITORY: johnlee79/jzl-closet
HANDOFF_POLICY: H1

[00_START_HERE.md](00_START_HERE.md)에서 저장소와 현재 승인 업무를 먼저 확인한다. CURRENT가 UNKNOWN이면 업무를 만들어내지 않는다. 현재 지정된 검수/변경 범위와 실제 main을 기준으로 필요한 파일만 읽는다.

제품 동작·결제·계정·데이터 정책은 [제품 참조](README.md)와 기존 코드/명세를 유지한다. 인수인계 최적화는 앱 실행·서버 배포·DB/결제 변경 승인이 아니다. 비밀값을 출력·커밋하지 않으며 기록/설계 문서를 일괄 삭제하지 않는다.

새 정본에는 승인된 범위·확인 근거·미확인·다음 한 행동만 둔다. 전체 댓글/보고를 시작 입력으로 쓰거나 완료된 실행을 반복하지 않는다. 문서 검사는 `python3 tools/check_handoff.py --root . --static`; 앱 검증은 실제 변경에 필요한 기존 검사를 선택한다. 정적 문서 검사 통과를 제품 검증으로 보고하지 않는다.
