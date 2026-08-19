import HScroll from '@/components/HScroll';

/**
 * 메인 CATEGORY 목록의 껍데기. (3-L)
 *
 * ★ 항목이 적으면 격자, 많으면 가로로 밀어 보게 바꿉니다.
 *   격자에 다섯 개가 들어오면 한 줄에 넷, 다음 줄에 하나가 덩그러니 남습니다.
 *   가로로 밀면 몇 개가 되든 한 줄로 흐릅니다.
 *
 * ★ 어느 쪽을 쓸지는 부르는 쪽이 정해서 넘깁니다.
 *   여기서 children 을 세지 않습니다. 개수를 아는 것은 목록을 만든 쪽입니다.
 */
export default function CategoryList({
  grid,
  children,
}: {
  grid: boolean;
  children: React.ReactNode;
}) {
  if (grid) {
    return (
      <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 lg:gap-x-6">
        {children}
      </ul>
    );
  }

  return (
    <HScroll label="분류" className="mt-10">
      {children}
    </HScroll>
  );
}
