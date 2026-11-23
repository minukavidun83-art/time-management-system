import React from 'react';
import { Download, Palette, Printer, X } from 'lucide-react';
import type {
  PdfColorMode,
  PdfOrientation,
  PdfPageSize,
  PdfPrintOptions,
} from '../lib/pdfExport.ts';

interface PdfPrintModalProps {
  open: boolean;
  title: string;
  options: PdfPrintOptions;
  onChange: (next: PdfPrintOptions) => void;
  onConfirm: () => void;
  onClose: () => void;
}

const PAGE_SIZES: Array<{ id: PdfPageSize; label: string; desc: string }> = [
  { id: 'a4', label: 'A4', desc: 'Standard (210 × 297 mm)' },
  { id: 'a3', label: 'A3', desc: 'Large Chart (297 × 420 mm)' },
  { id: 'a5', label: 'A5', desc: 'Compact (148 × 210 mm)' },
  { id: 'letter', label: 'Letter', desc: 'US Letter (8.5 × 11 in)' },
  { id: 'legal', label: 'Legal', desc: 'US Legal (8.5 × 14 in)' },
];

export const PdfPrintModal: React.FC<PdfPrintModalProps> = ({
  open,
  title,
  options,
  onChange,
  onConfirm,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-display text-base font-bold">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Page Size */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Paper / Page Size
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PAGE_SIZES.map((s) => {
                const active = options.pageSize === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onChange({ ...options, pageSize: s.id })}
                    className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="text-xs font-bold">{s.label}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{s.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Orientation */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Page Orientation
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'landscape', label: 'Landscape (Wide)' },
                { id: 'portrait', label: 'Portrait (Tall)' },
              ] as Array<{ id: PdfOrientation; label: string }>).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onChange({ ...options, orientation: o.id })}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    options.orientation === o.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color vs Black & White */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Print Mode (Color / Black &amp; White)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'color', label: 'Full Color', desc: 'Vibrant badges & headers' },
                { id: 'bw', label: 'Black & White', desc: 'Crisp monochrome print' },
              ] as Array<{ id: PdfColorMode; label: string; desc: string }>).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onChange({ ...options, colorMode: m.id })}
                  className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    options.colorMode === m.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5" />
                    {m.label}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
};
