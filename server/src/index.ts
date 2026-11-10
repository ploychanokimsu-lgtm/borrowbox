import { app } from "./app.js";

// Cloud Run chooses the port through $PORT; listen on all interfaces.
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BorrowBox API listening on port ${PORT}`);
});
