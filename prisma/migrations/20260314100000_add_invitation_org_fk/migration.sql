-- AddForeignKey: Invitation.organizationId -> Organization.id
-- Previously stored as plain String with no FK constraint (data integrity issue)

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
