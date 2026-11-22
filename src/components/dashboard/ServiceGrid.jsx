import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Stethoscope, BookOpen, MessageCircle, MapPin, Lightbulb, FlaskConical } from 'lucide-react';
import { useLang } from '@/lib/LanguageContext';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function ServiceGrid() {
  const { t } = useLang();

  const services = [
    { labelKey: 'symptomAnalysis', icon: Stethoscope, path: '/symptoms', gradient: 'from-teal-500 to-emerald-500' },
    { labelKey: 'diseaseLookup', icon: BookOpen, path: '/diseases', gradient: 'from-blue-500 to-cyan-500' },
    { labelKey: 'aiConsultation', icon: MessageCircle, path: '/chat', gradient: 'from-violet-500 to-purple-500' },
    { labelKey: 'nearbyHospitals', icon: MapPin, path: '/hospitals', gradient: 'from-amber-500 to-orange-500' },
    { labelKey: 'healthTips', icon: Lightbulb, path: '/chat', gradient: 'from-rose-500 to-pink-500' },
    { labelKey: 'medicineConsultation', icon: FlaskConical, path: '/medicine-consultation', gradient: 'from-indigo-500 to-blue-500' },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-3 gap-3">
      {services.map(({ labelKey, icon: Icon, path, gradient }) => (
        <motion.div key={labelKey} variants={item} className="h-full">
          <Link
            to={path}
            className="flex flex-col items-center h-full gap-2.5 p-3 sm:p-4 rounded-2xl glass-card hover:shadow-lg transition-all group"
          >
            <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
            <span className="text-xs font-medium text-center text-foreground/80 leading-tight">{t(labelKey)}</span>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}