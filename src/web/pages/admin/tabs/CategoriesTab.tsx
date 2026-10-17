import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { AdminCategory, AdminTournament } from '@shared/api';
import type { CompetitionFormat, MatchFormat } from '@shared/draw/types';
import { categoryLabel, COMPETITION_FORMATS, GENDERS, LEVELS, MATCH_FORMATS } from '@shared/labels';
import { useFeedback } from '../../../components/feedback';
import { Alert, Badge, Button, Card, cx, EmptyState, Field, Input, Modal, Select } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { useAdminAction } from '../../../lib/admin';

interface CategoryForm {
  gender: 'M' | 'F' | 'X';
  level: string;
  name: string;
  maxPairs: string;
  format: CompetitionFormat;
  matchFormat: MatchFormat;
  groupSize: string;
  qualifiersPerGroup: string;
}

const blank: CategoryForm = {
  gender: 'M',
  level: '3ª',
  name: '',
  maxPairs: '16',
  format: 'single_elimination',
  matchFormat: 'best_of_3_super_tb',
  groupSize: '4',
  qualifiersPerGroup: '2',
};

function CategoryDialog({
  t,
  editing,
  open,
  onClose,
}: {
  t: AdminTournament;
  editing: AdminCategory | null;
  open: boolean;
  onClose: () => void;
}) {
  const [v, setV] = useState<CategoryForm>(() =>
    editing
      ? {
          gender: editing.gender as CategoryForm['gender'],
          level: editing.level,
          name: editing.name,
          maxPairs: String(editing.maxPairs),
          format: editing.format,
          matchFormat: editing.matchFormat,
          groupSize: String(editing.groupSize),
          qualifiersPerGroup: String(editing.qualifiersPerGroup),
        }
      : blank,
  );
  const save = useAdminAction(
    t.id,
    () => {
      const body = {
        ...v,
        maxPairs: Number(v.maxPairs),
        groupSize: Number(v.groupSize),
        qualifiersPerGroup: Number(v.qualifiersPerGroup),
      };
      return editing
        ? api(`/admin/categories/${editing.id}`, { method: 'PUT', body })
        : api(`/admin/tournaments/${t.id}/categories`, { method: 'POST', body });
    },
    { success: editing ? 'Categoría actualizada' : 'Categoría creada', onSuccess: onClose },
  );
  const fields = save.error instanceof ApiError ? save.error.fields : {};
  const set = <K extends keyof CategoryForm>(k: K, value: CategoryForm[K]) => setV((s) => ({ ...s, [k]: value }));
  const locked = !!editing?.drawGenerated;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Editar ${editing.label}` : 'Nueva categoría'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {locked && <Alert tone="info">El cuadro ya está generado: solo puedes cambiar el nombre y el límite de parejas.</Alert>}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Modalidad</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(GENDERS) as Array<keyof typeof GENDERS>).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => set('gender', g)}
                className={cx(
                  'rounded-xl border px-3 py-2.5 text-sm font-semibold',
                  v.gender === g ? 'border-court-700 bg-court-50 text-court-900' : 'border-slate-200 text-slate-600',
                )}
              >
                {GENDERS[g]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nivel" htmlFor="c-level">
            <Select id="c-level" value={v.level} onChange={(e) => set('level', e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Máx. parejas" htmlFor="c-max" error={fields.maxPairs}>
            <Input id="c-max" type="number" min={2} max={128} value={v.maxPairs} onChange={(e) => set('maxPairs', e.target.value)} invalid={!!fields.maxPairs} />
          </Field>
          <Field label="Nombre (opcional)" htmlFor="c-name" hint={`Por defecto: ${categoryLabel(v)}`}>
            <Input id="c-name" value={v.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Formato de competición</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(COMPETITION_FORMATS) as CompetitionFormat[]).map((f) => (
              <button
                key={f}
                type="button"
                disabled={locked}
                onClick={() => setV((s) => ({ ...s, format: f, matchFormat: f === 'americano' ? 'games' : s.matchFormat === 'games' ? 'best_of_3_super_tb' : s.matchFormat }))}
                className={cx(
                  'rounded-xl border p-3 text-left disabled:opacity-60',
                  v.format === f ? 'border-court-700 bg-court-50 ring-2 ring-court-500/20' : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <p className="text-sm font-semibold text-slate-900">{COMPETITION_FORMATS[f].label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{COMPETITION_FORMATS[f].help}</p>
              </button>
            ))}
          </div>
        </div>
        {v.format === 'groups_knockout' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Parejas por grupo" htmlFor="c-gs">
              <Select id="c-gs" value={v.groupSize} disabled={locked} onChange={(e) => set('groupSize', e.target.value)}>
                {[3, 4, 5, 6].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </Select>
            </Field>
            <Field label="Clasifican por grupo" htmlFor="c-q">
              <Select id="c-q" value={v.qualifiersPerGroup} disabled={locked} onChange={(e) => set('qualifiersPerGroup', e.target.value)}>
                {[1, 2, 3].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <Field label="Formato de los partidos" htmlFor="c-mf">
          <Select id="c-mf" value={v.matchFormat} disabled={locked} onChange={(e) => set('matchFormat', e.target.value as MatchFormat)}>
            {(Object.keys(MATCH_FORMATS) as MatchFormat[]).map((m) => (
              <option key={m} value={m}>
                {MATCH_FORMATS[m]}
              </option>
            ))}
          </Select>
        </Field>
        {save.error && Object.keys(fields).length === 0 && <Alert tone="error">{save.error.message}</Alert>}
      </div>
    </Modal>
  );
}

export default function CategoriesTab({ t }: { t: AdminTournament }) {
  const [dialog, setDialog] = useState<{ open: boolean; editing: AdminCategory | null; key: number }>({ open: false, editing: null, key: 0 });
  const { confirm } = useFeedback();
  const remove = useAdminAction(t.id, (c: AdminCategory) => api(`/admin/categories/${c.id}`, { method: 'DELETE' }), { success: 'Categoría eliminada' });
  const openDialog = (editing: AdminCategory | null) => setDialog((d) => ({ open: true, editing, key: d.key + 1 }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Cada categoría tiene su propio límite de parejas, formato y cuadro.</p>
        <Button icon={<Plus className="size-4" />} onClick={() => openDialog(null)}>
          Nueva categoría
        </Button>
      </div>
      {t.categories.length === 0 ? (
        <EmptyState
          icon={<Tags className="size-6" />}
          title="Añade la primera categoría"
          action={
            <Button icon={<Plus className="size-4" />} onClick={() => openDialog(null)}>
              Nueva categoría
            </Button>
          }
        >
          Por ejemplo: Masculina 3ª, Femenina 4ª o Mixta Iniciación.
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {t.categories.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{c.label}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{COMPETITION_FORMATS[c.format].label}</p>
                  <p className="text-xs text-slate-500">{MATCH_FORMATS[c.matchFormat]}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" aria-label="Editar" onClick={() => openDialog(c)} icon={<Pencil className="size-4" />} />
                  <Button
                    variant="danger-ghost"
                    size="sm"
                    aria-label="Eliminar"
                    icon={<Trash2 className="size-4" />}
                    onClick={async () => {
                      if (await confirm({ title: `Eliminar ${c.label}`, message: 'Solo se puede eliminar si no tiene parejas inscritas.', confirmLabel: 'Eliminar', danger: true })) {
                        remove.mutate(c);
                      }
                    }}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="blue">
                  {c.confirmedCount}/{c.maxPairs} parejas
                </Badge>
                {c.waitlistCount > 0 && <Badge tone="amber">{c.waitlistCount} en espera</Badge>}
                {c.drawGenerated ? <Badge tone="green">Cuadro generado</Badge> : <Badge>Sin cuadro</Badge>}
                {c.format === 'groups_knockout' && (
                  <Badge>
                    Grupos de {c.groupSize}, pasan {c.qualifiersPerGroup}
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {dialog.open && <CategoryDialog key={dialog.key} t={t} editing={dialog.editing} open onClose={() => setDialog((d) => ({ ...d, open: false }))} />}
    </div>
  );
}
