"use client";

import AppShell from "@/components/layout/AppShell";
import { StartUpload } from "@/components/upload/StartUpload";
import "../../home-simple.css";

export default function NewLessonPage() {
  return (
    <AppShell>
      <main className="home-simple home-simple-new">
        <h1>Add your whiteboard photos.</h1>
        <StartUpload optionalDetails />
      </main>
    </AppShell>
  );
}
