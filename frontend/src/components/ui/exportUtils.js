/**
 * Utility functions for exporting data to CSV (RFC 4180) and JSON.
 */

export function exportToCsv(data, filename = "export", columns = null) {
  if (!data || !data.length) {
    alert("Aucune donnée à exporter.");
    return;
  }

  // Determine headers and keys
  let keys = [];
  let headerLabels = [];

  if (columns && Array.isArray(columns) && columns.length > 0) {
    keys = columns.map(c => typeof c === "string" ? c : c.key);
    headerLabels = columns.map(c => typeof c === "string" ? c : (c.label || c.key));
  } else {
    keys = Object.keys(data[0]);
    headerLabels = [...keys];
  }

  const separator = ",";
  const escapeCell = (val) => {
    if (val === null || val === undefined) return '""';
    let str = typeof val === "object" ? JSON.stringify(val) : String(val);
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerRow = headerLabels.map(escapeCell).join(separator);
  const dataRows = data.map(row => {
    return keys.map(k => escapeCell(row[k])).join(separator);
  });

  const csvContent = "\uFEFF" + [headerRow, ...dataRows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToJson(data, filename = "export") {
  if (!data) {
    alert("Aucune donnée à exporter.");
    return;
  }

  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${dateStr}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
