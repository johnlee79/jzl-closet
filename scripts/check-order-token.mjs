/**
 * ============================================================
 * 주문 토큰 서명 키가 제대로 갈렸는지 확인합니다
 * ============================================================
 *
 * 실행: npm run check:token
 *
 * ★★ 왜 필요한가
 *   주문 토큰 서명 키를 ADMIN_PASSWORD 에서 ORDER_TOKEN_SECRET 으로 옮겼습니다.
 *   이걸 잘못 옮기면 결제를 막 끝낸 손님이 완료 화면을 못 엽니다.
 *   화면으로 확인하려면 실제 주문을 넣어 봐야 하는데, 실제 DB 에
 *   시험 주문을 넣을 수는 없습니다. 그래서 서명 부분만 따로 확인합니다.
 *
 * ★ 실제 lib/order-token.ts 를 그대로 불러 씁니다.
 *   따로 베껴 쓰면 베낀 것만 맞고 진짜 코드는 틀릴 수 있습니다.
 *   Node 24 는 타입스크립트를 그대로 실행합니다.
 *
 * ★ DB 를 건드리지 않습니다. 네트워크도 쓰지 않습니다.
 *   서명을 만들고 맞춰 보기만 합니다.
 */

const CASES = [];

function check(name, passed, detail = '') {
  CASES.push({ name, passed, detail });
}

/**
 * 환경변수를 바꿔 가며 확인합니다.
 *
 * ★ order-token.ts 는 부를 때마다 process.env 를 다시 읽습니다.
 *   그래서 모듈을 다시 불러올 필요 없이 값만 갈아 끼우면 됩니다.
 */
async function main() {
  process.env.SUPPRESS_SERVER_ONLY = '1';

  const mod = await import('../lib/order-token.ts');
  const { createOrderToken, verifyOrderToken } = mod;

  const ORDER = 'ORD-20260824-0001';
  const OTHER = 'ORD-20260824-0002';

  /* ── 1. 새 키가 없을 때 — 지금까지와 똑같이 동작해야 합니다 ── */
  delete process.env.ORDER_TOKEN_SECRET;
  process.env.ADMIN_PASSWORD = 'old-admin-password';

  const oldToken = await createOrderToken(ORDER);
  check('새 키를 안 넣어도 토큰이 발급된다', oldToken.length > 0);
  check('그 토큰이 통과한다', await verifyOrderToken(ORDER, oldToken));
  check('다른 주문번호로는 안 통한다', !(await verifyOrderToken(OTHER, oldToken)));

  /* ── 2. 새 키를 넣은 뒤 ── */
  process.env.ORDER_TOKEN_SECRET = 'brand-new-order-secret';

  const newToken = await createOrderToken(ORDER);
  check('새 키로 만든 토큰이 통과한다', await verifyOrderToken(ORDER, newToken));
  check(
    '새 키와 옛 키로 만든 토큰이 서로 다르다',
    newToken.split('.')[1] !== oldToken.split('.')[1]
  );

  /*
   * ── 3. 옛 키로 만든 토큰은 이제 통하지 않습니다 ──
   *
   * ★★ 2026-08-25 에 바뀐 부분입니다.
   *   예전에는 옛 키(ADMIN_PASSWORD)로 만든 토큰도 확인만은 받아 줬습니다.
   *   키를 갈아 끼우는 그 순간에 결제를 끝낸 손님이 막히지 않게 하려던
   *   임시 다리였습니다. 토큰 수명이 6시간이라 하루가 지나 쓸모가 없어졌고,
   *   남겨 두면 관리자 비밀번호가 계속 손님 토큰을 열 수 있는 열쇠로 남습니다.
   *   그래서 지웠고, 이 검사도 반대로 뒤집었습니다.
   */
  check(
    '옛 키로 만든 토큰은 통하지 않는다 (임시 다리를 지웠음)',
    !(await verifyOrderToken(ORDER, oldToken)),
    '← 두 열쇠가 완전히 분리됐다는 뜻입니다'
  );

  /* ── 4. 관리자 비밀번호를 바꿔도 손님 토큰은 멀쩡해야 합니다 ── */
  process.env.ADMIN_PASSWORD = 'a-completely-different-password';
  check(
    '관리자 비밀번호를 바꿔도 새 토큰은 그대로 통과한다',
    await verifyOrderToken(ORDER, newToken),
    '← 이번 작업의 목적입니다'
  );

  /* ── 5. 아무 키도 없으면 발급도 인정도 하지 않습니다 ── */
  delete process.env.ORDER_TOKEN_SECRET;
  delete process.env.ADMIN_PASSWORD;
  check('키가 없으면 토큰을 발급하지 않는다', (await createOrderToken(ORDER)) === '');
  check('키가 없으면 아무 토큰도 인정하지 않는다', !(await verifyOrderToken(ORDER, newToken)));

  /* ── 6. 만료 ── */
  process.env.ORDER_TOKEN_SECRET = 'brand-new-order-secret';
  const past = Date.now() - 1000 * 60 * 60 * 7; // 7시간 전에 만든 것
  const expired = await createOrderToken(ORDER, past);
  check('6시간이 지난 토큰은 안 통한다', !(await verifyOrderToken(ORDER, expired)));

  /* ── 결과 ── */
  const failed = CASES.filter((item) => !item.passed);
  for (const item of CASES) {
    console.log(`${item.passed ? '  통과' : '  실패'}  ${item.name}${item.detail ? `  ${item.detail}` : ''}`);
  }
  console.log('');
  if (failed.length > 0) {
    console.log(`${failed.length}개가 실패했습니다. 배포하지 마세요.`);
    process.exit(1);
  }
  console.log(`${CASES.length}개 모두 통과했습니다.`);
}

main().catch((error) => {
  console.error('확인 중 오류가 났습니다:', error);
  process.exit(1);
});
