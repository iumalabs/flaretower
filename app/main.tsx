import { createRoot } from "react-dom/client";
import { ExposureInventory } from "./pages/ExposureInventory.tsx";
import "./styles/tokens.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root element not found");
}

createRoot(root).render(<ExposureInventory />);
