import React, { useState } from 'react';
import { db } from '@/api/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Pill, Plus, Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import GlassCard from '@/components/ui/GlassCard';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useLang } from '@/lib/LanguageContext';

export default function MedicineReminder() {
  const { t } = useLang();
  const { user } = useOutletContext();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ medicine_name: '', dosage: '', frequency: 'once_daily', notes: '' });
  const [slotCount, setSlotCount] = useState(1);
  const [timeSlots, setTimeSlots] = useState(['']);
  const queryClient = useQueryClient();

  const freqLabels = {
    once_daily: t('onceDaily'),
    twice_daily: t('twiceDaily'),
    thrice_daily: t('thriceDaily'),
    weekly: t('weekly'),
    as_needed: t('asNeeded'),
  };

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ['medicines', user?.id],
    queryFn: () => db.MedicineReminder.filter({ user_id: user?.id }, '-created_at'),
    enabled: !!user?.id,
  });

  const createReminder = useMutation({
    mutationFn: (data) => db.MedicineReminder.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicines'] });
      setShowForm(false);
      setForm({ medicine_name: '', dosage: '', frequency: 'once_daily', notes: '' });
      setSlotCount(1);
      setTimeSlots(['']);
    },
  });

  const toggleReminder = useMutation({
    mutationFn: ({ id, is_active }) => db.MedicineReminder.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['medicines'] }),
  });

  const deleteReminder = useMutation({
    mutationFn: (id) => db.MedicineReminder.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['medicines'] }),
  });

  return (
    <div className="p-4 space-y-5 pb-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Pill className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-xl">{t('medicineReminderTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('medicineReminderSubtitle')}</p>
            </div>
          </div>
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogTrigger asChild>
              <Button size="icon" className="rounded-xl bg-primary shadow-lg shadow-primary/25">
                <Plus className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-heading">{t('addMedicine')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <Input placeholder={t('medicineName')} value={form.medicine_name} onChange={e => setForm({ ...form, medicine_name: e.target.value })} className="rounded-xl" />
                <Input placeholder={t('dosage')} value={form.dosage} onChange={e => setForm({ ...form, dosage: e.target.value })} className="rounded-xl" />
                <Select value={form.frequency} onValueChange={v => setForm({ ...form, frequency: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(freqLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Time slots */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Reminder Times</label>
                    <Select value={String(slotCount)} onValueChange={v => {
                      const n = Number(v);
                      setSlotCount(n);
                      setTimeSlots(prev => {
                        const arr = [...prev];
                        while (arr.length < n) arr.push('');
                        return arr.slice(0, n);
                      });
                    }}>
                      <SelectTrigger className="rounded-xl w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4,5].map(n => (
                          <SelectItem key={n} value={String(n)}>{n} {n === 1 ? 'time' : 'times'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {Array.from({ length: slotCount }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-14 flex-shrink-0">Slot {i + 1}</span>
                      <Input
                        type="time"
                        value={timeSlots[i] || ''}
                        onChange={e => {
                          const updated = [...timeSlots];
                          updated[i] = e.target.value;
                          setTimeSlots(updated);
                        }}
                        className="rounded-xl flex-1"
                      />
                    </div>
                  ))}
                </div>

                <Input placeholder={t('notesOptional')} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="rounded-xl" />
                <Button onClick={() => createReminder.mutate({ ...form, time_slots: timeSlots.filter(Boolean) })} disabled={!form.medicine_name || !form.dosage} className="w-full rounded-xl bg-primary">
                  {t('addMedicine')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {isLoading ? <LoadingSkeleton rows={3} /> : (
        <div className="space-y-3">
          {reminders.map((r, i) => (
            <GlassCard key={r.id} delay={i * 0.05}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${r.is_active !== false ? 'bg-indigo-500/10' : 'bg-muted'}`}>
                    <Pill className={`h-5 w-5 ${r.is_active !== false ? 'text-indigo-600' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <p className={`font-medium text-sm ${r.is_active === false ? 'text-muted-foreground line-through' : ''}`}>{r.medicine_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>{r.dosage}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{freqLabels[r.frequency]}</span>
                    </div>
                    {r.time_slots?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.time_slots.map((slot, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 font-medium">{slot}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={r.is_active !== false}
                    onCheckedChange={(checked) => toggleReminder.mutate({ id: r.id, is_active: checked })}
                  />
                  <Button variant="ghost" size="icon" className="rounded-xl text-destructive h-8 w-8" onClick={() => deleteReminder.mutate(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </GlassCard>
          ))}
          {reminders.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">{t('noMedicines')}</p>
          )}
        </div>
      )}
    </div>
  );
}