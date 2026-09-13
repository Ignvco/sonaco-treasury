import { Download, FileSpreadsheet, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { downloadFile, toCSV, downloadExcel, type ExportRow } from "@/lib/export";

interface ExportMenuProps {
  rows: ExportRow[];
  filename: string;
  label?: string;
  className?: string;
  onExport?: (format: "excel" | "pdf") => void;
}

/**
 * Excel creates a native workbook; PDF opens the browser print dialog.
 */
export function ExportMenu({ rows, filename, label = "Exportar", className, onExport }: ExportMenuProps) {
  const handleExcel = async () => {
    await downloadExcel(rows, filename);
    onExport?.("excel");
  };
  const handlePDF = () => {
    onExport?.("pdf");
    window.print();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-xl border border-[#EAEAEA] bg-card px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:border-brand/40 hover:text-brand",
            className,
          )}
        >
          <Download className="h-3.5 w-3.5" />
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[12px] text-muted-foreground">
          Exportar reporte
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleExcel}>
          <FileSpreadsheet className="h-4 w-4 text-success" />
          Exportar Excel
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handlePDF}>
          <FileText className="h-4 w-4 text-danger" />
          Imprimir / guardar PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
