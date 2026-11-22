import React, { useState } from 'react';
import { db } from '@/api/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { Phone, Plus, Trash2, Ambulance, MapPin, Heart, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import GlassCard from '@/components/ui/GlassCard';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useLang } from '@/lib/LanguageContext';

export default function EmergencyContacts() {
  const { t } = useLang();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', relationship: '' });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);

  // Send my exact location to someone: the phone's share sheet (WhatsApp, SMS...),
  // or WhatsApp on computers. Falls back to copying the link.
  const shareLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: 'Location is not available on this device.', variant: 'destructive' });
      return;
    }
    setSharing(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const link = 'https://maps.google.com/?q=' + coords.latitude.toFixed(6) + ',' + coords.longitude.toFixed(6);
        const text = 'I need help. My current location: ' + link;
        try {
          if (navigator.share) await navigator.share({ title: 'My location', text });
          else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
        } catch (err) {
          if (err?.name !== 'AbortError') {
            try {
              await navigator.clipboard.writeText(text);
              toast({ title: 'Location link copied. Paste it in any message.' });
            } catch {
              toast({ title: link });
            }
          }
        } finally {
          setSharing(false);
        }
      },
      () => {
        setSharing(false);
        toast({ title: 'Please allow location access to share your location.', variant: 'destructive' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const emergencyOptions = [
    { label: t('callAmbulance'), icon: Ambulance, color: 'from-red-500 to-rose-500', href: 'tel:112' },
    { label: t('shareLocation'), icon: MapPin, color: 'from-blue-500 to-cyan-500', onClick: shareLocation, busy: sharing },
    {
      label: t('firstAidGuide'), icon: Heart, color: 'from-emerald-500 to-green-500',
      onClick: () => navigate('/chat?q=' + encodeURIComponent(t('firstAidQuestion'))),
    },
    { label: t('nearestHospital'), icon: BookOpen, color: 'from-violet-500 to-purple-500', onClick: () => navigate('/hospitals') },
  ];

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['emergency-contacts'],
    queryFn: () => db.EmergencyContact.list('-created_at'),
  });

  const createContact = useMutation({
    mutationFn: (data) => db.EmergencyContact.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emergency-contacts'] });
      setShowForm(false);
      setForm({ name: '', phone: '', relationship: '' });
    },
  });

  const deleteContact = useMutation({
    mutationFn: (id) => db.EmergencyContact.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['emergency-contacts'] }),
  });

  return (
    <div className="p-4 space-y-5 pb-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center shadow-lg shadow-red-500/20">
            <Phone className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">{t('emergencyTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('emergencySubtitle')}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-3">
        {emergencyOptions.map(({ label, icon: Icon, color, href, onClick, busy }, i) => {
          const Tag = href ? motion.a : motion.button;
          const linkProps = href ? { href } : { type: 'button', onClick, disabled: !!busy };
          return (
            <Tag
              key={label}
              {...linkProps}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.96 }}
              transition={{ delay: i * 0.05 }}
              className={'flex flex-col items-center justify-center gap-2 p-5 min-h-[7rem] rounded-2xl bg-gradient-to-br text-white shadow-lg hover:opacity-90 transition-opacity disabled:opacity-70 ' + color}
            >
              <Icon className={'h-7 w-7' + (busy ? ' animate-pulse' : '')} />
              <span className="text-sm font-semibold text-center">{label}</span>
            </Tag>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-sm text-muted-foreground">{t('emergencyContactsSection')}</h3>
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="rounded-xl gap-1">
              <Plus className="h-4 w-4" /> {t('addContact')}
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-heading">{t('emergencyContactsSection')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <Input placeholder={t('nameLabel')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="rounded-xl" />
              <Input placeholder={t('phoneLabel')} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="rounded-xl" />
              <Input placeholder={t('relationshipLabel')} value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value })} className="rounded-xl" />
              <Button onClick={() => createContact.mutate(form)} disabled={!form.name || !form.phone} className="w-full rounded-xl bg-primary">
                {t('saveContact')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <LoadingSkeleton rows={2} /> : (
        <div className="space-y-3">
          {contacts.map((c, i) => (
            <GlassCard key={c.id} delay={i * 0.05}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                    <Phone className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.relationship} · {c.phone}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button asChild variant="ghost" size="icon" className="rounded-xl text-primary">
                    <a href={`tel:${c.phone}`}><Phone className="h-4 w-4" /></a>
                  </Button>
                  <Button variant="ghost" size="icon" className="rounded-xl text-destructive" onClick={() => deleteContact.mutate(c.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </GlassCard>
          ))}
          {contacts.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">{t('noContacts')}</p>
          )}
        </div>
      )}
    </div>
  );
}