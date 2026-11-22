import { supabase } from '@/lib/supabase';

// Thin data layer over Supabase with the same shape the app used with Base44
// entities: filter(filters, sort, limit), list(sort, limit), create, update, delete.
// Row Level Security on every table means each user only ever sees their own rows,
// so user_id filters are optional.

function parseSort(sort) {
  if (!sort) return null;
  const desc = sort.startsWith('-');
  return { column: desc ? sort.slice(1) : sort, ascending: !desc };
}

function entity(table) {
  const filter = async (filters = {}, sort, limit) => {
    let query = supabase.from(table).select('*');
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) query = query.eq(key, value);
    }
    const order = parseSort(sort);
    if (order) query = query.order(order.column, { ascending: order.ascending });
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  };

  return {
    filter,
    list: (sort, limit) => filter({}, sort, limit),
    async count(filters = {}) {
      let query = supabase.from(table).select('id', { count: 'exact', head: true });
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined) query = query.eq(key, value);
      }
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    async create(row) {
      const { data, error } = await supabase.from(table).insert(row).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, patch) {
      const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
  };
}

export const db = {
  ChatMessage: entity('chat_messages'),
  SymptomCheck: entity('symptom_checks'),
  HealthReport: entity('health_reports'),
  EmergencyContact: entity('emergency_contacts'),
  MedicineReminder: entity('medicine_reminders'),
};

// Upload a medical report to the user's private folder; returns its storage path.
export async function uploadReportFile(file, userId) {
  const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
  const path = `${userId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from('health-reports')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}
