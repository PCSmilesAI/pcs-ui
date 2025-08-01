
const columns = ["Name", "Payment Method", "Outstanding Amount", "Contact"];

export default function VendorTable({ data = [], onSelect }) {
  return (
    <div className="border rounded-md overflow-hidden">
      <div className="bg-[#f7f9fb] px-4 py-2 border-b">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 text-sm font-semibold text-[#357ab2]">
          {columns.map((col) => (
            <div key={col}>{col}</div>
          ))}
        </div>
      </div>

      {data.map((row, idx) => (
        <div
          key={idx}
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer border-b"
          onClick={() => onSelect?.(row)}
        >
          {columns.map((col) => (
            <div key={col} className="truncate">{row[col]}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
