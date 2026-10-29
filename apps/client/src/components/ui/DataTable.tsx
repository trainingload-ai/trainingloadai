"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import CardLoader from "@/components/ui/CardLoader";
import { Pagination } from "@/components/ui/Pagination";
import { cn } from "@/lib/utils";

type ColumnMeta = {
  className?: string;
  headClassName?: string;
  cellClassName?: string;
};

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  total?: number;
  currentPage?: number;
  itemsPerPage?: number;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
  showPagination?: boolean;
  actions?: React.ReactNode;
  /** 内部纵向滚动 + 固定表头（默认关闭，避免影响其他表格） */
  stickyHeader?: boolean;
  /** 表格区域最大高度（仅 stickyHeader=true 时生效） */
  maxBodyHeightClassName?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  total = 0,
  currentPage = 1,
  itemsPerPage = 10,
  onPageChange,
  emptyMessage = "No data available",
  showPagination = true,
  actions,
  stickyHeader = false,
  maxBodyHeightClassName = "max-h-[60dvh]",
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(total / itemsPerPage),
  });

  return (
    <>
      {(showPagination || actions) && (
        <div className="flex items-center justify-between">
          <div>{actions}</div>
          {showPagination && onPageChange && (
            <Pagination
              currentPage={currentPage}
              totalItems={total}
              itemsPerPage={itemsPerPage}
              onPageChange={onPageChange}
              disabled={isLoading}
            />
          )}
        </div>
      )}

      <div className="overflow-x-auto overflow-hidden rounded-surface border relative">
        {isLoading && <CardLoader />}
        <div
          className={cn(
            stickyHeader && "overflow-y-auto overscroll-y-contain",
            stickyHeader && maxBodyHeightClassName,
          )}
        >
          {/* 当需要 sticky header 时，避免使用 `Table` 组件自带的 overflow 容器，否则 sticky 会被错误的滚动祖先“截断” */}
          <table className="w-full caption-bottom text-sm">
            <TableHeader className={cn(stickyHeader && "relative z-20")}>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        stickyHeader && "sticky top-0 z-20 bg-background",
                        (header.column.columnDef.meta as ColumnMeta)
                          ?.headClassName ??
                          (header.column.columnDef.meta as ColumnMeta)
                            ?.className,
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          (cell.column.columnDef.meta as ColumnMeta)
                            ?.cellClassName ??
                            (cell.column.columnDef.meta as ColumnMeta)
                              ?.className,
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-50 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </table>
        </div>
      </div>
    </>
  );
}
