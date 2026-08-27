/**
 * ================================================================
 * ** 채팅 상담 — 대화 흐름 (2-A, 2026-08-27)
 * ================================================================
 *
 * ** 메뉴를 한 화면에 펼쳐 두지 않습니다.
 *   1차에서는 모든 항목을 쭉 늘어놓았는데, "숨겨둔 페이지를 꺼내 놓은 것"
 *   처럼 보이고 대화하는 느낌이 없었습니다.
 *   이제 **한 단계씩 좁혀 들어갑니다.** 큰 갈래를 먼저 고르고, 그 안에서
 *   다시 고릅니다.
 *
 * ** 여기는 '무엇을 물어보고 무엇을 고를 수 있는지' 만 적습니다.
 *   화면(components/ChatWidget.tsx)은 이 나무를 따라 걷기만 합니다.
 *   항목을 더하거나 뺄 때 화면을 안 고쳐도 됩니다.
 *   나중에 AI 자동응답을 붙이게 되면 이 나무를 그대로 읽으면 됩니다.
 *
 * ** AI 가 답하지 않습니다. 자유 입력은 '문의 남기기' 에서만 받습니다.
 *   주문·배송처럼 틀리면 안 되는 것은 버튼으로 정확히 갑니다.
 *
 * ** 개인정보는 채팅창 안에 그리지 않습니다. 해당 화면으로 보냅니다.
 *   채팅창 안에 그리면 그 값을 또 어디선가 읽어야 하고, 남이 어깨너머로
 *   보는 자리가 하나 더 생깁니다.
 * ================================================================
 */

/** 손님이 고를 수 있는 것 하나 */
export type ChatOption = {
  label: string;
  /** 다음으로 갈 갈래 */
  next?: string;
  /** 자주 묻는 질문 하나. 누르면 답이 말풍선으로 뜹니다. */
  answer?: string;
  /** 사이트 안쪽 주소. 누르면 채팅창을 닫고 그리로 갑니다. */
  href?: string;
  /** 화면을 옮기지 않고 채팅창 안에 답으로 띄우는 것 */
  note?: 'hours' | 'phone' | 'kakao' | 'cardCancel';
  /** 한 줄 설명. 없으면 안 그립니다. */
  hint?: string;
  /** 'member' 는 로그인한 손님에게만, 'guest' 는 비로그인에게만 보입니다. */
  audience?: 'member' | 'guest';
};

/** 갈래 하나 — 우리가 묻는 말 + 고를 수 있는 것들 */
export type ChatNode = {
  /** 왼쪽 말풍선으로 뜨는 우리 말 */
  ask: string;
  options: ChatOption[];
};

/** 맨 처음 갈래의 이름 */
export const ROOT = 'root';

/** '← 처음으로' 는 모든 갈래에 둡니다. 한 곳에서 만들어 씁니다. */
const BACK: ChatOption = { label: '← 처음으로', next: ROOT };

export const CHAT_TREE: Record<string, ChatNode> = {
  /* ── 처음 ────────────────────────────────────────────── */
  [ROOT]: {
    ask: '무엇을 도와드릴까요?',
    options: [
      /*
       * ** '내 정보' 는 로그인한 손님에게만 보입니다.
       *   보이는데 누르면 로그인 화면이 뜨면 막힌 느낌을 줍니다.
       *   비로그인 손님에게 필요한 것은 주문번호로 여는 조회 화면입니다.
       */
      { label: '내 정보', next: 'me', audience: 'member' },
      { label: '주문 · 배송', next: 'order' },
      { label: '교환 · 반품 · 취소', next: 'return' },
      { label: '자주 묻는 질문', next: 'faq' },
      { label: '상담원 연결', next: 'human' },
    ],
  },

  /* ── 내 정보 (로그인) ────────────────────────────────── */
  me: {
    ask: '어떤 것을 보시겠어요?',
    options: [
      { label: '포인트 내역', href: '/mypage/points' },
      { label: '친구 초대', href: '/mypage/invite' },
      {
        label: '회원정보 확인',
        href: '/mypage/profile',
        hint: '이름 · 연락처 · 배송지를 확인하고 고치실 수 있습니다',
      },
      BACK,
    ],
  },

  /* ── 주문 · 배송 ─────────────────────────────────────── */
  order: {
    ask: '어떤 것이 궁금하신가요?',
    options: [
      /*
       * ** 배송 조회를 따로 두지 않습니다. (사장님 판단)
       *   송장번호로 조회하는 화면이 따로 없고, 택배사 링크가 주문 안에
       *   이미 있습니다. (components/MemberOrderList.tsx 의 trackingUrl)
       *   메뉴를 둘로 나누면 둘 다 같은 곳으로 가게 됩니다.
       */
      {
        label: '주문 내역 · 배송 조회',
        href: '/mypage/orders',
        hint: '주문 상태와 송장 조회를 한 곳에서',
        audience: 'member',
      },
      { label: '문의 내역', href: '/mypage/inquiries', audience: 'member' },
      {
        label: '비회원 주문 조회',
        href: '/order-lookup',
        hint: '주문번호와 연락처로 확인하실 수 있습니다',
        audience: 'guest',
      },
      {
        label: '비회원 문의 조회',
        href: '/inquiry/lookup',
        hint: '남기신 문의의 답변을 확인하실 수 있습니다',
        audience: 'guest',
      },
      {
        label: '배송 안내',
        href: '/guide',
        hint: '배송비 · 무료배송 기준 · 소요일',
      },
      {
        label: '로그인하면 더 편해요',
        href: '/login',
        hint: '주문 내역 · 포인트를 한 번에',
        audience: 'guest',
      },
      BACK,
    ],
  },

  /* ── 교환 · 반품 · 취소 ──────────────────────────────── */
  return: {
    ask: '취소 · 교환 · 반품을 도와드릴게요. 어떤 것이 궁금하신가요?',
    options: [
      {
        label: '취소 · 교환 · 반품 안내',
        href: '/guide',
        hint: '가능한 기간과 절차를 확인하실 수 있습니다',
      },
      {
        label: '주문을 취소하고 싶어요',
        href: '/mypage/orders',
        hint: '주문 상세에서 취소를 요청하실 수 있습니다',
        audience: 'member',
      },
      {
        label: '주문을 취소하고 싶어요',
        href: '/order-lookup',
        hint: '주문번호로 조회한 뒤 취소를 요청하실 수 있습니다',
        audience: 'guest',
      },
      { label: '카드 결제 취소는 얼마나 걸리나요?', note: 'cardCancel' },
      {
        label: '교환 · 반품을 신청하고 싶어요',
        href: '/inquiry/new',
        hint: '문의를 남겨 주시면 확인하고 안내드립니다',
      },
      BACK,
    ],
  },

  /* ── 자주 묻는 질문 ──────────────────────────────────── */
  /*
   * ** 여기 적힌 것은 **답변이 하나도 없을 때** 쓰는 자리입니다. (2-C)
   *   관리자에 답변을 쓴 질문이 하나라도 있으면, 그 질문들로 통째로
   *   바뀝니다. (아래 faqNode)
   *
   * ** 빈 갈래가 뜨지 않게 하려고 이렇게 했습니다. (사장님 지시)
   *   답변을 아직 안 쓰셨을 때 '많이 물어보시는 것' 을 눌렀는데 아무것도
   *   없으면, 없느니만 못합니다. 그래서 답이 하나도 없으면 지금까지처럼
   *   있는 안내 화면으로 보냅니다.
   *
   * ** '운영 시간' 을 여기서 뺐습니다. (2-B, 2026-08-27)
   *   '상담원 연결' 갈래에도 똑같은 것이 있었습니다. 같은 것이 두 곳에
   *   있으면 한쪽만 고쳤을 때 어긋납니다.
   */
  faq: {
    ask: '많이 물어보시는 것을 모아 두었어요.',
    options: [
      { label: '배송은 얼마나 걸리나요?', href: '/guide' },
      { label: '배송비 · 무료배송 기준이 궁금해요', href: '/guide' },
      { label: '교환 · 반품이 되나요?', href: '/guide' },
      BACK,
    ],
  },

  /* ── 상담원 연결 ─────────────────────────────────────── */
  human: {
    /*
     * ** '사람에게' 를 뺐습니다. (2026-08-27)
     *   손님 입장에서는 당연히 사람이라 굳이 짚을 필요가 없고,
     *   짚으면 "지금까지는 사람이 아니었다" 는 느낌을 줍니다.
     *   채팅 어디에서도 우리가 기계라는 것을 드러내지 않습니다.
     */
    ask: '연결해 드릴게요. 어떤 방법이 편하세요?',
    options: [
      {
        label: '문의 남기기',
        href: '/inquiry/new',
        hint: '영업일 기준 1~2일 안에 답변드립니다',
      },
      { label: '전화 걸기', note: 'phone' },
      { label: '오픈채팅으로 연결', note: 'kakao' },
      { label: '운영 시간 보기', note: 'hours' },
      BACK,
    ],
  },
};

/**
 * 카드 결제 취소 안내.
 *
 * ** '바로 취소됩니다' 라고 쓰지 않습니다. (사장님 지시)
 *   KSNET 은 가맹점에 취소 권한을 주지 않아 사람이 대행사를 통해 처리합니다.
 *   (lib/orders.ts 의 requestCancelByCustomer 주석)
 *   바로 된다고 안내하면 "취소됐다는데 돈이 안 들어온다" 는 분쟁이 납니다.
 */
export const CARD_CANCEL_NOTICE =
  '카드 취소는 카드사를 거쳐야 해서 보통 1~2일, 늦어도 영업일 기준 7일 안에 처리됩니다.';

/** 관리자에 적어 둔 질문 하나 (/api/faq 가 내려 줍니다) */
export type FaqItem = { id: string; question: string; answer: string };

/**
 * 「자주 묻는 질문」 갈래를 만듭니다.
 *
 * ** 답변이 있는 질문이 하나라도 있으면 그 질문들로 채웁니다.
 *   하나도 없으면 위에 적어 둔 안내 화면 갈래를 그대로 씁니다.
 *   **빈 갈래는 어떤 경우에도 안 뜹니다.** (사장님 지시)
 *
 * ** 답이 긴 것을 자르지 않습니다.
 *   자르면 어디서 잘렸는지 사장님이 알 수 없고, 중요한 말이 잘린 채
 *   나가면 그게 곧 분쟁이 됩니다. 채팅창은 위아래로 굴러가므로 긴 답도
 *   읽을 수 있습니다. 대신 관리자 화면에 글자 수를 보여 줍니다.
 *
 * ** 질문을 몇 개까지 보여 줄지 여기서 자르지 않습니다.
 *   갈림길('무엇을 도와드릴까요')은 5개를 안 넘게 하지만, 여기는 원래
 *   목록입니다. 목록을 세 쪽으로 나누면 손님이 찾던 것을 못 찾습니다.
 *   많다고 느껴지시면 관리자에서 안 쓰는 질문의 노출을 꺼 주세요.
 */
export function faqNode(items: FaqItem[]): ChatNode {
  /*
   * ** 답이 빈 질문은 여기서 한 번 더 걸러 냅니다.
   *   서버(getVisibleFaqs)에서 이미 빼고 보내지만, 혹시 새어 나오면
   *   **눌러도 아무 일이 없는 죽은 버튼**이 됩니다. 그것이 빈 말풍선보다
   *   나쁩니다. 두 겹으로 막습니다.
   */
  const answered = items.filter((item) => item.answer.trim().length > 0);

  if (answered.length === 0) return CHAT_TREE.faq;

  return {
    ask: '많이 물어보시는 것을 모아 두었어요. 궁금한 것을 눌러 주세요.',
    options: [
      ...answered.map((item) => ({ label: item.question, answer: item.answer })),
      /*
       * ** 목록 맨 아래에 안내 화면 한 줄을 남겨 둡니다.
       *   여기 없는 것을 찾는 손님이 막다른 길에 서지 않게 합니다.
       */
      {
        label: '배송 · 교환 · 반품 안내 보기',
        href: '/guide',
        hint: '여기 없는 것은 안내 화면에서 확인하실 수 있습니다',
      },
      BACK,
    ],
  };
}

/** 이 손님에게 보여 줄 선택지만 골라냅니다. */
export function optionsFor(node: ChatNode, loggedIn: boolean): ChatOption[] {
  return node.options.filter((option) =>
    option.audience === 'member' ? loggedIn : option.audience === 'guest' ? !loggedIn : true
  );
}
