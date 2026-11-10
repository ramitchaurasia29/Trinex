import { HashRouter } from "react-router-dom";
import AppRoutes from "./routes";
import { AuthProvider } from "./auth";
import { StoreProvider } from "./store";
import { TradingDataProvider } from "./trading";
import { ServerStateProvider } from "./query";
import { ToolDataProvider } from "./tool-data";

export default function App() {
  return (
    <HashRouter>
      <ServerStateProvider><StoreProvider><AuthProvider><TradingDataProvider><ToolDataProvider><AppRoutes /></ToolDataProvider></TradingDataProvider></AuthProvider></StoreProvider></ServerStateProvider>
    </HashRouter>
  );
}
