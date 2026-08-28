import { isDemoWorkspace } from "@/lib/demoWorkspace";
import RequestsDemo from "./RequestsDemo";
import RequestsLegacy from "./RequestsLegacy";

export default function RequestsRoute() {
  return isDemoWorkspace() ? <RequestsDemo /> : <RequestsLegacy />;
}
