import React from 'react';
import { Edit, Eye, MoreVertical, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DataTableColumn {
  key: string;
  label: string;
  render?: (item: any) => React.ReactNode;
  icon?: React.ReactNode;
  showOnMobile?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn[];
  onView?: (item: T) => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  allowEdit?: boolean;
  allowDelete?: boolean;
}

export function DataTable<T extends { id: number }>({
  data,
  columns,
  onView,
  onEdit,
  onDelete,
  isLoading = false,
  emptyMessage = "No data available",
  allowEdit = true,
  allowDelete = true
}: DataTableProps<T>) {
  
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden w-full border border-[#a3cef1]">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6096ba] mx-auto mb-2"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden w-full border border-[#a3cef1]">
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-600">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden w-full max-w-full border border-[#a3cef1]">
      {/* Mobile Card View */}
      <div className="block sm:hidden space-y-2.5 sm:space-y-3 p-2 sm:p-3">
        {data.map((item) => (
          <div 
            key={item.id} 
            className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow mx-auto flex flex-col"
            style={{ 
              maxWidth: 'calc(100vw - 1rem)', 
              width: '100%',
              overflow: 'hidden'
            }}
          >
            {/* Mobile: Stack columns; make content vertically scrollable within card */}
            <div className="p-3 space-y-3 max-h-60 overflow-y-auto pr-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {columns.map((column) => (
                <div key={column.key} className="rounded-md border border-gray-100 p-3">
                  <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">
                    {column.label}
                  </div>
                  <div className="text-sm text-gray-900 leading-relaxed break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    {column.render
                      ? column.render(item)
                      : String(item[column.key as keyof T] || '-')
                    }
                  </div>
                </div>
              ))}
            </div>

            {/* Fixed Action Buttons */}
            {(onView || onEdit || onDelete) && (
              <div className="pt-2.5 px-3 sm:px-4 pb-3 sm:pb-4 border-t border-gray-200 flex gap-2 flex-shrink-0">
                {onView && (
                  <button
                    onClick={() => onView(item)}
                    className="flex-1 inline-flex justify-center items-center px-3 sm:px-4 py-2.5 sm:py-3 border border-transparent text-xs sm:text-sm font-semibold rounded-lg text-white transition-all duration-150 ease-in-out transform hover:shadow-lg active:scale-95 active:shadow-md bg-[#6096ba] hover:bg-[#274c77] touch-manipulation"
                    style={{ minHeight: '44px' }}
                  >
                    <Eye className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 flex-shrink-0" />
                    <span className="whitespace-nowrap">View</span>
                  </button>
                )}
                {(allowEdit && onEdit) && (
                  <button
                    onClick={() => onEdit(item)}
                    className="flex-1 inline-flex justify-center items-center px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-300 text-xs sm:text-sm font-semibold rounded-lg text-gray-700 transition-all hover:bg-gray-50 active:scale-95 touch-manipulation"
                    style={{ minHeight: '44px' }}
                  >
                    <Edit className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 flex-shrink-0" />
                    <span className="whitespace-nowrap">Edit</span>
                  </button>
                )}
                {(allowDelete && onDelete) && (
                  <button
                    onClick={() => onDelete(item)}
                    className="flex-1 inline-flex justify-center items-center px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-red-300 text-xs sm:text-sm font-semibold rounded-lg text-red-700 transition-all hover:bg-red-50 active:scale-95 touch-manipulation"
                    style={{ minHeight: '44px' }}
                  >
                    <Trash2 className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 flex-shrink-0" />
                    <span className="whitespace-nowrap">Delete</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block overflow-x-auto w-full">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#274c77] hover:bg-[#274c77]">
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className="px-3 py-2 text-left text-xs font-medium text-white uppercase tracking-wider"
                  style={{ minWidth: '120px' }}
                >
                  <div className="flex items-center space-x-2">
                    {column.icon && <span className="h-4 w-4">{column.icon}</span>}
                    <span>{column.label}</span>
                  </div>
                </TableHead>
              ))}
              {(onView || onEdit || onDelete) && (
                <TableHead className="px-3 py-2 text-left text-xs font-medium text-white uppercase tracking-wider">
                  <div className="flex items-center space-x-2">
                    <MoreVertical className="h-4 w-4" />
                    <span>Actions</span>
                  </div>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id} className="hover:bg-gray-50 text-gray-900">
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className="px-3 py-3 whitespace-nowrap text-sm text-gray-900"
                  >
                    {column.render
                      ? column.render(item)
                      : String(item[column.key as keyof T] || '-')
                    }
                  </TableCell>
                ))}
                {(onView || onEdit || onDelete) && (
                  <TableCell className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {onView && (
                        <button
                          onClick={() => onView(item)}
                          className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded-md text-white transition-all duration-150 ease-in-out transform hover:shadow-lg active:scale-95 active:shadow-md bg-[#6096ba]"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </button>
                      )}
                      {(allowEdit && onEdit) || (allowDelete && onDelete) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="inline-flex items-center px-2 py-1 border text-xs font-medium rounded-md transition-all duration-200 shadow-sm hover:shadow-md border-gray-300 text-gray-700">
                              <MoreVertical className="h-4 w-4 mr-1" />
                              More
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {allowEdit && onEdit && (
                              <DropdownMenuItem onClick={() => onEdit(item)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {allowDelete && onDelete && (
                              <DropdownMenuItem onClick={() => onDelete(item)} className="text-red-600">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
