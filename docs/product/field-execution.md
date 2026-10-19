# Field execution

Log Visit is the single interaction entry workflow. Physical visits keep canonical contacts, outcomes, photos, targeting/status transitions and follow-up behavior. Phone/email/text/video/internal-note channels use AccountActivity and never increment physical visit counts. Private notes are not copied into shared follow-up descriptions.

Organization Setup configures agency and wholesale visit guides. Submitted answers save the exact prompt snapshot; stale guide submissions are rejected. Existing camera/upload and voice workflows remain available. Photo category selection uses the established shelf/display/menu/back-bar/competitor/other enum and object-storage upload path.

On a trusted device, users may explicitly keep a local physical-visit draft. It is scoped to organization, user, account and initiating task/opportunity/event, expires after 24 hours, and is restored only on request. It contains text/selection fields, not photo blobs or a full offline queue. Restore never submits or sends. The original submission key prevents a retried draft from creating another visit. Users can remove it explicitly.

My Schedule offers route ordering for up to 27 current assigned Worklist stops. Timed appointments retain their order. The first/last stop are fixed for provider optimization. With explicit Google Routes configuration, the server requests and validates the returned order; without it, straight-line nearby ordering is labeled as a fallback with no travel estimate. Users review and save ordering; canonical due dates and calendar appointments are unchanged. Existing map browsing and external directions remain the navigation workflow.
