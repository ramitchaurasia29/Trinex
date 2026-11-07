import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./routes";
import { StoreProvider } from "./store";

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <AppRoutes />
      </StoreProvider>
    </BrowserRouter>
  );
}
