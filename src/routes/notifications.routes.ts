import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { Notification } from "../entities/Notification";
import { authenticate } from "../middleware/authenticate";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get("/", async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Notification);
    const companyId = req.authProfile!.companyId;
    const recipientId = req.authProfile!.id;
    const [data, unreadCount] = await Promise.all([
      repo.find({ where: { companyId, recipientId }, order: { createdAt: "DESC" }, take: 100 }),
      repo.count({ where: { companyId, recipientId, isRead: false } })
    ]);
    res.json({ data, unreadCount });
  } catch (error) { next(error); }
});

notificationsRouter.patch("/read-all", async (req, res, next) => {
  try {
    await AppDataSource.getRepository(Notification).createQueryBuilder()
      .update(Notification).set({ isRead: true, readAt: () => "COALESCE(read_at, NOW())" })
      .where("company_id = :companyId AND recipient_id = :recipientId AND is_read = false", {
        companyId: req.authProfile!.companyId, recipientId: req.authProfile!.id
      }).execute();
    res.json({ success: true });
  } catch (error) { next(error); }
});

notificationsRouter.patch("/:id/read", async (req, res, next) => {
  try {
    const result = await AppDataSource.getRepository(Notification).createQueryBuilder()
      .update(Notification).set({ isRead: true, readAt: () => "COALESCE(read_at, NOW())" })
      .where("id = :id AND company_id = :companyId AND recipient_id = :recipientId", {
        id: req.params.id, companyId: req.authProfile!.companyId, recipientId: req.authProfile!.id
      }).execute();
    if (!result.affected) {
      res.status(404).json({ error: { code: "NOTIFICATION_NOT_FOUND", message: "Notification introuvable." } });
      return;
    }
    res.json({ success: true });
  } catch (error) { next(error); }
});

notificationsRouter.delete("/:id", async (req, res, next) => {
  try {
    const result = await AppDataSource.getRepository(Notification).delete({
      id: req.params.id, companyId: req.authProfile!.companyId, recipientId: req.authProfile!.id
    });
    if (!result.affected) {
      res.status(404).json({ error: { code: "NOTIFICATION_NOT_FOUND", message: "Notification introuvable." } });
      return;
    }
    res.status(204).send();
  } catch (error) { next(error); }
});
