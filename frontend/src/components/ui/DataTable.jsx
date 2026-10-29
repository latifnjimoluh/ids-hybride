import React, { useState, useMemo } from "react";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  FileSpreadsheet,
  FileJson,
  ChevronLeft,
  ChevronRight,
  Database
} from "lucide-react";
import Button from "./Button";
import { exportToCsv, exportToJson } from "./exportUtils";

export default function DataTable({
  columns = [],
  data = [],
  searchKeys = [],
  onRowClick = null,
  exportFilename = "data",
  defaultSort = null,
  pagination = true,
  initialPageSize = 15,
  pageSizeOptions = [15, 25, 50, 100],
  emptyMessage = "Aucun enregistrement trouvé.",
  actions = null,
  className = ""
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState(defaultSort || { key: null, direction: null });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    if (!searchQuery.trim()) return data;

    const query = searchQuery.toLowerCase().trim();
    return data.filter(row => {
      if (searchKeys.length > 0) {
        return searchKeys.some(key => {
          const val = row[key];
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(query);
        });
      }
      // If no search keys specified, search all column keys
      return columns.some(col => {
        const val = row[col.key];
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(query);
      });
    });
  }, [data, searchQuery, searchKeys, columns]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return filteredData;

    return [...filteredData].sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      // Numeric comparison
      if (typeof valA === "number" && typeof valB === "number") {
        return sortConfig.direction === "asc" ? valA - valB : valB - valA;
      }

      // String comparison
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return sortConfig.direction === "asc" ? -1 : 1;
      if (strA > strB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  // Pagination calculation
  const totalItems = sortedData.length;
  const totalPages = pagination ? Math.max(1, Math.ceil(totalItems / pageSize)) : 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedData = useMemo(() => {
    if (!pagination) return sortedData;
    const start = (safeCurrentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, pagination, safeCurrentPage, pageSize]);

  // Handle sort header click
  const handleSort = (key, sortable) => {
    if (!sortable) return;
    setSortConfig(prev => {
      if (prev.key !== key) {
        return { key, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { key, direction: "desc" };
      }
      return { key: null, direction: null };
    });
    setCurrentPage(1);
  };

  const handleExportCsv = () => {
    exportToCsv(sortedData, exportFilename, columns);
  };

  const handleExportJson = () => {
    exportToJson(sortedData, exportFilename);
  };

  return (
    <div className={`datatable-container ${className}`}>
      {/* Toolbar: Search + Actions + Export */}
      <div className="datatable-toolbar">
        <div className="datatable-search">
          <Search size={15} className="datatable-search-icon" />
          <input
            type="text"
            placeholder="Recherche instantanée..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className="datatable-actions">
          {actions}
          {exportFilename && (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={<FileSpreadsheet size={14} color="#10b981" />}
                onClick={handleExportCsv}
                title="Exporter au format CSV"
              >
                CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<FileJson size={14} color="#38bdf8" />}
                onClick={handleExportJson}
                title="Exporter au format JSON"
              >
                JSON
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Table Content */}
      <div className="datatable-table-wrap">
        <table className="datatable">
          <thead>
            <tr>
              {columns.map(col => {
                const isSortActive = sortConfig.key === col.key;
                const isSortable = col.sortable !== false;
                return (
                  <th
                    key={col.key}
                    className={isSortable ? "sortable" : ""}
                    style={{ width: col.width }}
                    onClick={() => handleSort(col.key, isSortable)}
                  >
                    <div className="flex items-center gap-1">
                      <span>{col.label}</span>
                      {isSortable && (
                        <span style={{ color: isSortActive ? "var(--soc-accent)" : "var(--soc-text-muted)" }}>
                          {isSortActive ? (
                            sortConfig.direction === "asc" ? (
                              <ArrowUp size={13} />
                            ) : (
                              <ArrowDown size={13} />
                            )
                          ) : (
                            <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div className="flex flex-col items-center gap-2" style={{ color: "var(--soc-text-muted)" }}>
                    <Database size={28} style={{ opacity: 0.4 }} />
                    <span style={{ fontSize: 13.5 }}>{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => {
                return (
                  <tr
                    key={row.id || row.sid || idx}
                    className={onRowClick ? "clickable" : ""}
                    onClick={() => onRowClick && onRowClick(row)}
                  >
                    {columns.map(col => {
                      const val = row[col.key];
                      const rendered = col.render ? col.render(val, row) : val;
                      return (
                        <td key={col.key} className={col.className || ""}>
                          {rendered ?? "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pagination && totalItems > 0 && (
        <div className="datatable-pagination">
          <div className="flex items-center gap-2">
            <span>
              Lignes {(safeCurrentPage - 1) * pageSize + 1} à {Math.min(safeCurrentPage * pageSize, totalItems)} sur {totalItems}
            </span>
            <span style={{ color: "var(--soc-border)" }}>|</span>
            <div className="flex items-center gap-1">
              <span>Afficher</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{ width: "auto", padding: "2px 8px", height: 26, fontSize: 12 }}
              >
                {pageSizeOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span>
              Page {safeCurrentPage} / {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                aria-label="Page précédente"
                style={{ padding: "4px 8px" }}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                aria-label="Page suivante"
                style={{ padding: "4px 8px" }}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
