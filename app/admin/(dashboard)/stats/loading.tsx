import { CardsSkeleton } from '@/components/admin/Skeleton';

/** 통계는 조회가 무거워 스켈레톤이 특히 중요합니다. */
export default function Loading() {
  return <CardsSkeleton />;
}
