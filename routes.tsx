import { Link, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import Welcome from "./screens/onboarding/Welcome";
import Login from "./screens/onboarding/Login";
import ConnectBrokers from "./screens/onboarding/ConnectBrokers";
import Sync from "./screens/onboarding/Sync";
import Positions from "./screens/Positions";
import PositionDetail from "./screens/PositionDetail";
import Tools from "./screens/Tools";
import SelectTarget from "./screens/flow/SelectTarget";
import Configure from "./screens/flow/Configure";
import Review from "./screens/flow/Review";
import Activity from "./screens/activity/Activity";
import More from "./screens/more/More";
import Profile from "./screens/more/Profile";
import Brokers from "./screens/more/Brokers";
import Notifications from "./screens/more/Notifications";
import ToolDefaults from "./screens/more/ToolDefaults";
import Appearance from "./screens/more/Appearance";
import Help from "./screens/more/Help";
import Support from "./screens/more/Support";
import About from "./screens/more/About";
import Account from "./screens/more/Account";
import Offline from "./screens/system/Offline";
import Maintenance from "./screens/system/Maintenance";
import ForceUpdate from "./screens/system/ForceUpdate";
import SessionExpired from "./screens/system/SessionExpired";

function LoadingScreen() {
  return <div className="min-h-screen bg-surface" aria-label="Loading session" />;
}

function RequireAuth() {
  const { user, loading, sessionExpired } = useAuth();
  if (loading) return <LoadingScreen />;
  if (sessionExpired) return <Navigate to="/system/session" replace />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return user ? <Navigate to="/positions" replace /> : <Login />;
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return <Navigate to={user ? "/positions" : "/welcome"} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/login" element={<LoginRoute />} />

      <Route element={<RequireAuth />}>
        <Route path="/onboarding/brokers" element={<ConnectBrokers />} />
        <Route path="/onboarding/sync" element={<Sync />} />

        <Route path="/positions" element={<Positions />} />
        <Route path="/positions/armed" element={<Positions />} />
        <Route path="/positions/closed" element={<Positions />} />
        <Route path="/position/:id" element={<PositionDetail />} />

        <Route path="/tools" element={<Tools />} />
        <Route path="/tools/:toolId/select" element={<SelectTarget />} />
        <Route path="/tools/:toolId/configure" element={<Configure />} />
        <Route path="/tools/:toolId/review" element={<Review />} />

        <Route path="/activity" element={<Activity />} />
        <Route path="/activity/history" element={<Activity />} />
        <Route path="/activity/alerts" element={<Activity />} />

        <Route path="/more" element={<More />} />
        <Route path="/more/profile" element={<Profile />} />
        <Route path="/more/brokers" element={<Brokers />} />
        <Route path="/more/notifications" element={<Notifications />} />
        <Route path="/more/defaults" element={<ToolDefaults />} />
        <Route path="/more/appearance" element={<Appearance />} />
        <Route path="/more/help" element={<Help />} />
        <Route path="/more/support" element={<Support />} />
        <Route path="/more/about" element={<About />} />
        <Route path="/more/account" element={<Account />} />
      </Route>

      <Route path="/system/offline" element={<Offline />} />
      <Route path="/system/maintenance" element={<Maintenance />} />
      <Route path="/system/update" element={<ForceUpdate />} />
      <Route path="/system/session" element={<SessionExpired />} />

      <Route
        path="*"
        element={
          <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-canvas">
            <p className="text-lg font-semibold tracking-tight">Page not found</p>
            <Link to="/positions" className="text-sm font-medium text-primary hover:underline">Back to Positions</Link>
          </div>
        }
      />
    </Routes>
  );
}
