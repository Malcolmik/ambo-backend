import app from "./app";
import { env } from "./config/env";
import authRouter from "./modules/auth/auth.routes";
import usersRouter from "./modules/users/users.routes";
import clientsRouter from "./modules/clients/clients.routes";
import tasksRouter from "./modules/tasks/tasks.routes";
import contractsRouter from "./modules/contracts/contracts.routes";
import paymentsRouter from "./modules/payments/payments.routes"; 

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/contracts", contractsRouter);
app.use("/api/payments", paymentsRouter); 

app.listen(env.port, () => {
  console.log(`API running on port ${env.port}`);
});
