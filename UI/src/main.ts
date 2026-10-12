import "./styles/app.css";
import { startRouter, type Screen, type ScreenFactory } from "./app/router";
import { startSession } from "./app/session";
import { landingScreen } from "./screens/landing";

/** Load a screen module on first visit so the landing page ships without three.js. */
function lazy(load: () => Promise<ScreenFactory>): ScreenFactory {
  return () => {
    let screen: Screen | null = null;
    let gone = false;
    return {
      async mount(root, params) {
        const factory = await load();
        if (gone) return;
        screen = factory();
        await screen.mount(root, params);
      },
      unmount() {
        gone = true;
        screen?.unmount();
      },
    };
  };
}

startSession();
startRouter(document.getElementById("app")!, {
  "/": landingScreen,
  "/command": lazy(() => import("./screens/command").then((m) => m.commandScreen)),
  "/lobby": lazy(() => import("./screens/lobby").then((m) => m.lobbyScreen)),
  "/immersive": lazy(() => import("./screens/immersive").then((m) => m.immersiveScreen)),
});
