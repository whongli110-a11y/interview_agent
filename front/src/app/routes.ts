import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/pages/Dashboard";
import { KnowledgeBase } from "./components/pages/KnowledgeBase";
import { InterviewSetup } from "./components/pages/InterviewSetup";
import { ChatInterview } from "./components/pages/ChatInterview";
import { InterviewReport } from "./components/pages/InterviewReport";
import { History } from "./components/pages/History";
import { Settings } from "./components/pages/Settings";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: "documents", Component: KnowledgeBase },
      { path: "interviews/new", Component: InterviewSetup },
      { path: "interviews/:id", Component: ChatInterview },
      { path: "interviews/:id/report", Component: InterviewReport },
      { path: "history", Component: History },
      { path: "settings", Component: Settings },
    ],
  },
]);
