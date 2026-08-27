/**
 * Diálogo de confirmación reutilizable, con 4 variantes de color
 * (success/info/warning/error) coherentes con la paleta ya usada en el
 * resto de la UI (badges de Reglas.tsx: bg-{color}-100 text-{color}-700,
 * bordes rounded-lg/rounded-xl, botón primario bg-blue-600).
 *
 * Uso:
 *   <ConfirmDialog
 *     open={mostrarConfirmVaciar}
 *     variant="warning"
 *     title="¿Vaciar el lote de pólizas?"
 *     message={`Se eliminarán los ${polizas.length} PDFs y su progreso de entrenamiento.`}
 *     confirmLabel="Vaciar lote"
 *     destructivo
 *     onConfirm={confirmarVaciarLote}
 *     onCancel={() => setMostrarConfirmVaciar(false)}
 *   />
 */
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react';

export type ConfirmVariant = 'success' | 'info' | 'warning' | 'error';

const VARIANTES: Record<ConfirmVariant, {
  bg: string; border: string; iconBg: string; iconColor: string;
  icon: React.FC<{ className?: string }>;
  botonDefault: string;
}> = {
  success: {
    bg: 'bg-emerald-50', border: 'border-emerald-200',
    iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600',
    icon: CheckCircle2, botonDefault: 'bg-emerald-600 hover:bg-emerald-700',
  },
  info: {
    bg: 'bg-blue-50', border: 'border-blue-200',
    iconBg: 'bg-blue-100', iconColor: 'text-blue-600',
    icon: Info, botonDefault: 'bg-blue-600 hover:bg-blue-700',
  },
  warning: {
    bg: 'bg-amber-50', border: 'border-amber-200',
    iconBg: 'bg-amber-100', iconColor: 'text-amber-600',
    icon: AlertTriangle, botonDefault: 'bg-amber-600 hover:bg-amber-700',
  },
  error: {
    bg: 'bg-red-50', border: 'border-red-200',
    iconBg: 'bg-red-100', iconColor: 'text-red-600',
    icon: XCircle, botonDefault: 'bg-red-600 hover:bg-red-700',
  },
};

interface ConfirmDialogProps {
  open: boolean;
  variant?: ConfirmVariant;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Fuerza el botón de confirmar a rojo, sin importar la variante —
   * para acciones irreversibles (ej. "Vaciar lote"), independiente de si
   * el diálogo en sí es "warning" o cualquier otra variante. */
  destructivo?: boolean;
  /** Deshabilita los botones y cambia el label de confirmar mientras la
   * acción está en curso. */
  procesando?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  variant = 'info',
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructivo = false,
  procesando = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const v = VARIANTES[variant];
  const Icon = v.icon;
  const botonConfirmar = destructivo ? 'bg-red-600 hover:bg-red-700' : v.botonDefault;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onCancel}
    >
      <div
        className={`w-full max-w-sm rounded-2xl border ${v.border} ${v.bg} shadow-xl p-4`}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-9 h-9 rounded-full ${v.iconBg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${v.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-sm font-bold text-gray-900">{title}</p>
            <p className="text-xs text-gray-600 mt-1 leading-snug">{message}</p>
          </div>
          <button
            onClick={onCancel}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            disabled={procesando}
            className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-white/60 rounded-lg transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={procesando}
            className={`px-3 py-1.5 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-50 ${botonConfirmar}`}
          >
            {procesando ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
