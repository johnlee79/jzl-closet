import type { Measurement } from '@/lib/types';

type MeasurementTableProps = {
  measurements: Measurement[];
  productName: string;
};

/**
 * 실측 표. 항목명과 값 한 쌍을 그대로 출력합니다.
 * 서버에서 HTML 로 완성되어 나가므로 검색엔진이 수치를 읽을 수 있습니다.
 */
export default function MeasurementTable({
  measurements,
  productName,
}: MeasurementTableProps) {
  if (measurements.length === 0) return null;

  return (
    <section aria-labelledby="measurement-heading" className="w-full">
      <h3 id="measurement-heading" className="font-serif text-[22px] text-ink md:text-[26px]">
        실측 사이즈
      </h3>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-left">
          <caption className="sr-only">{productName} 실측 치수 (단위 cm)</caption>
          <tbody>
            {measurements.map((row) => (
              <tr key={row.label} className="border-b border-stone first:border-t">
                <th
                  scope="row"
                  className="w-[45%] py-3 pr-4 text-[14px] font-normal tracking-[0.1em] text-muted md:w-40"
                >
                  {row.label}
                </th>
                <td className="py-3 pr-4 text-[16px] tabular-nums text-ink">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[14px] leading-relaxed text-muted">
        단위 cm. 재는 방법에 따라 1~2cm 오차가 있을 수 있습니다.
      </p>
    </section>
  );
}
