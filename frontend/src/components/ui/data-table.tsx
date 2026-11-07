import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Select } from './select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
};

type DataTableProps<T> = {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  searchValue?: (row: T) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  emptyState?: ReactNode;
  caption?: string;
};

export function DataTable<T>({
  data,
  columns,
  getRowId,
  searchValue,
  searchPlaceholder = 'Filter rows…',
  pageSize = 10,
  emptyState = 'No results.',
  caption,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ id: string; direction: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(pageSize);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const rows = normalized && searchValue
      ? data.filter(row => searchValue(row).toLocaleLowerCase().includes(normalized))
      : data;
    if (!sort) return rows;
    const column = columns.find(item => item.id === sort.id);
    if (!column?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const left = column.sortValue?.(a);
      const right = column.sortValue?.(b);
      const comparison = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [columns, data, query, searchValue, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = filtered.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage);
  const firstRow = filtered.length ? currentPage * rowsPerPage + 1 : 0;
  const lastRow = Math.min((currentPage + 1) * rowsPerPage, filtered.length);

  function toggleSort(column: DataTableColumn<T>) {
    if (!column.sortValue) return;
    setSort(current => current?.id === column.id
      ? { id: column.id, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { id: column.id, direction: 'asc' });
    setPage(0);
  }

  return (
    <div className="data-table">
      {searchValue && <div className="data-table-toolbar">
        <label className="data-table-filter"><Search size={15} aria-hidden="true"/><Input
          type="search"
          value={query}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          onChange={event => { setQuery(event.target.value); setPage(0); }}
        /></label>
        <span className="data-table-count" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'result' : 'results'}</span>
      </div>}
      <Table className="data-table-grid">
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader><TableRow>{columns.map(column => {
          const activeSort = sort?.id === column.id;
          return <TableHead key={column.id} className={column.className} aria-sort={activeSort ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
            {column.sortValue ? <button className="data-table-sort" type="button" onClick={() => toggleSort(column)} aria-label={`Sort by ${String(column.header)}`}>
              {column.header}<span aria-hidden="true">{activeSort ? (sort.direction === 'asc' ? <ArrowUp size={13}/> : <ArrowDown size={13}/>) : <ArrowUpDown size={13}/>}</span>
            </button> : column.header}
          </TableHead>;
        })}</TableRow></TableHeader>
        <TableBody>{visibleRows.length ? visibleRows.map(row => <TableRow key={getRowId(row)}>{columns.map(column => <TableCell key={column.id} className={column.className}>{column.cell(row)}</TableCell>)}</TableRow>) : <TableRow><TableCell className="data-table-empty" colSpan={columns.length}>{emptyState}</TableCell></TableRow>}</TableBody>
      </Table>
      {filtered.length > 0 && <div className="data-table-pagination">
        <span>{firstRow}–{lastRow} of {filtered.length}</span>
        <label className="data-table-page-size">Rows per page<Select aria-label="Rows per page" value={String(rowsPerPage)} onChange={event => { setRowsPerPage(Number(event.target.value)); setPage(0); }}><option value="5">5</option><option value="10">10</option><option value="20">20</option><option value="50">50</option></Select></label>
        <div><Button variant="outline" aria-label="Previous page" disabled={currentPage === 0} onClick={() => setPage(value => Math.max(0, value - 1))}><ChevronLeft size={15}/></Button><span aria-live="polite">Page {currentPage + 1} of {pageCount}</span><Button variant="outline" aria-label="Next page" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))}><ChevronRight size={15}/></Button></div>
      </div>}
    </div>
  );
}
