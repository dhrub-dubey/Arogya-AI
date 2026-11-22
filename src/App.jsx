import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { LanguageProvider } from '@/lib/LanguageContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import MainLayout from '@/components/layout/MainLayout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Dashboard from '@/pages/Dashboard';
import AIChat from '@/pages/AIChat';
import SymptomChecker from '@/pages/SymptomChecker';
import DiseaseInfo from '@/pages/DiseaseInfo';
import HealthReports from '@/pages/HealthReports';
import EmergencyContacts from '@/pages/EmergencyContacts';
import NearbyHospitals from '@/pages/NearbyHospitals';
import MedicineReminder from '@/pages/MedicineReminder';
import MedicineConsultation from '@/pages/MedicineConsultation';
import HealthHistory from '@/pages/HealthHistory';
import Settings from '@/pages/Settings';

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20 animate-pulse">
            <span className="text-xl">💊</span>
          </div>
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }


  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/chat" element={<AIChat />} />
          <Route path="/symptoms" element={<SymptomChecker />} />
          <Route path="/diseases" element={<DiseaseInfo />} />
          <Route path="/reports" element={<HealthReports />} />
          <Route path="/emergency" element={<EmergencyContacts />} />
          <Route path="/hospitals" element={<NearbyHospitals />} />
          <Route path="/medicines" element={<MedicineReminder />} />
          <Route path="/medicine-consultation" element={<MedicineConsultation />} />
          <Route path="/history" element={<HealthHistory />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </LanguageProvider>
    </AuthProvider>
  )
}

export default App