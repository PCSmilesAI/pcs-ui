
const columns = ["Invoice", "Vendor", "Amount", "Office", "Due Date", "Category"];

export default function InvoiceTable({ data = [], onSelectInvoice }) {
  return (
    <div className="border rounded-md overflow-hidden">
      <div className="bg-[#f7f9fb] px-4 py-2 border-b">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 text-sm font-semibold text-[#357ab2]">
          {columns.map((col) => (
            <div key={col} className="truncate">
              {col}
            </div>
          ))}
        </div>
      </div>

      {data.map((row, idx) => (
        <div
          key={idx}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer border-b"
          onClick={() => onSelectInvoice?.(row)}
        >
          {columns.map((col) => (
            <div key={col} className="truncate">
              {row[col]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
