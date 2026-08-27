/**
 * ================================================================
 * ** 채팅 상담 메뉴 (1차, 2026-08-27)
 * ================================================================
 *
 * ** AI 가 알아서 답하지 않습니다. 버튼을 눌러 고르는 방식입니다.
 *   주문·배송처럼 틀리면 안 되는 것은 버튼으로 정확히 갑니다.
 *   자유 입력은 마지막 '문의 남기기' 에서만 받습니다.
 *
 * ** 메뉴를 코드가 아니라 데이터로 둡니다.
 *   화면(components/ChatWidget.tsx)은 이 목록을 돌면서 그리기만 합니다.
 *   나중에 항목을 더하거나 뺄 때 화면을 안 고쳐도 됩니다.
 *   AI 자동응답을 붙이게 되면 이 목록을 그대로 읽으면 됩니다.
 *
 * ** 개인정보는 채팅창 안에 그리지 않습니다.
 *   주문 내역·포인트·회원정보는 해당 화면으로 보냅니다.
 *   채팅창 안에 그리면 그 값을 또 어디선가 읽어야 하고,
 *   남이 어깨너머로 보는 자리가 하나 더 생깁니다.
 *
 * ** 로그인하지 않은 손님에게는 개인 메뉴를 아예 보여주지 않습니다.
 *   보이는데 누르면 로그인 화면이 뜨면 막힌 느낌을 줍니다.
 *   비회원에게 필요한 것은 주문번호로 여는 조회 화면입니다.
 * ================================================================
 */

export type ChatItem = {
  label: string;
  /** 사이트 안쪽 주소. 누르면 채팅창을 닫고 그리로 갑니다. */
  href?: string;
  /**
   * 화면을 옮기지 않고 채팅창 안에서 글만 보여 주는 항목.
   * (예: 운영 시간 안내)
   */
  note?: 'hours' | 'phone' | 'kakao';
  /** 한 줄 설명. 없으면 안 그립니다. */
  hint?: string;
};

export type ChatSection = {
  title: string;
  /** 'member' 는 로그인한 손님에게만, 'guest' 는 비로그인에게만 보입니다. */
  audience: 'member' | 'guest' | 'all';
  items: ChatItem[];
};

export const CHAT_SECTIONS: ChatSection[] = [
  {
    title: '내 정보',
    audience: 'member',
    items: [
      {
        label: '주문 내역 · 배송 조회',
        href: '/mypage/orders',
        /*
         * ** 배송 조회를 따로 두지 않습니다. (사장님 판단)
         *   송장번호로 조회하는 화면이 따로 없고, 택배사 링크가 주문 안에
         *   이미 있습니다. (components/MemberOrderList.tsx 의 trackingUrl)
         *   메뉴를 둘로 나누면 둘 다 같은 곳으로 가게 됩니다.
         */
        hint: '주문 상태와 송장 조회를 한 곳에서 보실 수 있습니다',
      },
      { label: '문의 내역', href: '/mypage/inquiries' },
      { label: '포인트 내역', href: '/mypage/points' },
      { label: '친구 초대', href: '/mypage/invite' },
      {
        label: '회원정보 확인',
        href: '/mypage/profile',
        hint: '이름 · 연락처 · 배송지를 확인하고 고치실 수 있습니다',
      },
    ],
  },
  {
    title: '주문 확인',
    audience: 'guest',
    items: [
      {
        label: '주문 조회',
        href: '/order-lookup',
        hint: '주문번호와 연락처로 확인하실 수 있습니다',
      },
      {
        label: '문의 조회',
        href: '/inquiry/lookup',
        hint: '남기신 문의의 답변을 확인하실 수 있습니다',
      },
      {
        label: '로그인하면 더 편해요',
        href: '/login',
        hint: '주문 내역 · 포인트를 한 번에 보실 수 있습니다',
      },
    ],
  },
  {
    title: '주문 관련',
    audience: 'all',
    items: [
      {
        label: '취소 · 교환 · 반품 안내',
        href: '/guide',
        hint: '가능한 기간과 절차를 확인하실 수 있습니다',
      },
    ],
  },
  {
    title: '안내',
    audience: 'all',
    items: [
      /*
       * * 자주 묻는 질문은 2차입니다. 아직 그 화면이 없습니다.
       *   없는 곳으로 보내는 메뉴를 두지 않습니다.
       */
      { label: '배송 안내', href: '/guide', hint: '배송비 · 무료배송 기준 · 소요일' },
      { label: '운영 시간 안내', note: 'hours' },
    ],
  },
  {
    title: '사람에게',
    audience: 'all',
    items: [
      {
        label: '문의 남기기',
        href: '/inquiry/new',
        hint: '영업일 기준 1~2일 안에 답변드립니다',
      },
      { label: '전화 걸기', note: 'phone' },
      { label: '오픈채팅으로 연결', note: 'kakao' },
    ],
  },
];

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
