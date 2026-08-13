import type { Measurements } from '@/lib/products';

type MeasurementTableProps = {
  measurements: Measurements;
  productName: string;
};

/** 의류 실측 표. 서버에서 HTML로 출력되어 검색엔진이 수치를 읽을 수 있습니다. */
export default function MeasurementTable({
  measurements,
  productName,
}: MeasurementTableProps) {
  return (
    <section aria-labelledby="measurement-heading" className="w-full">
      <h3 id="measurement-heading" className="font-serif text-[20px] text-ink md:text-[24px]">
        실측 사이즈
      </h3>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-left">
          <caption className="sr-only">{productName} 사이즈별 실측 치수 (단위 cm)</caption>
          <thead>
            <tr className="border-y border-stone">
              <th scope="col" className="py-3 pr-4 text-[12px] tracking-[0.14em] text-muted">
                사이즈
              </th>
              {measurements.sizes.map((size) => (
                <th
                  key={size}
                  scope="col"
                  className="py-3 pr-4 text-[13px] font-normal text-ink"
                >
                  {size}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {measurements.rows.map((row) => (
              <tr key={row.label} className="border-b border-stone">
                <th
                  scope="row"
                  className="py-3 pr-4 text-[12px] font-normal tracking-[0.1em] text-muted"
                >
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td
                    key={`${row.label}-${measurements.sizes[index] ?? index}`}
                    className="py-3 pr-4 text-[13px] tabular-nums text-ink"
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {measurements.note ? (
        <p className="mt-4 text-[12px] leading-relaxed text-muted">{measurements.note}</p>
      ) : null}
    </section>
  );
}
