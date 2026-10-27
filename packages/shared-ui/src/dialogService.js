let dialogHandler = null;
const waiting = [];

export function registerDialogHandler(handler) {
  dialogHandler = handler;
  while (waiting.length) waiting.shift()(handler);
  return () => { if (dialogHandler === handler) dialogHandler = null; };
}

function requestDialog(options) {
  return new Promise((resolve) => {
    const dispatch = (handler) => handler(options, resolve);
    if (dialogHandler) dispatch(dialogHandler);
    else waiting.push(dispatch);
  });
}

export const appDialog = {
  alert: (message, title = "Notice") => requestDialog({ type: "alert", title, message: String(message || "") }),
  confirm: (message, title = "Please confirm") => requestDialog({ type: "confirm", title, message: String(message || "") }),
  prompt: (message, defaultValue = "", title = "Enter information", multiline = false) => requestDialog({ type: "prompt", title, message: String(message || ""), value: defaultValue, multiline }),
};
