# Native upload pipeline — decision record

Status: implemented and verified on simulator against the local stack.
`expo-image-picker` is removed; the pipeline is Swift end to end
(`PhotoUploadModule` + `UploadCenter` + `UploadJobPreparer`), JS keeps tag
sanitisation, the review/queue UI mirror, and cookie/endpoint handover. No
backend change was required.

## Why the JS picker is being dropped

`expo-image-picker` copies every selected asset into the app's cache before it
returns. From `node_modules/expo-image-picker/ios/MediaHandler.swift:490-498`:

```swift
private func generateUrl(withFileExtension: String) throws -> URL {
  let directory = fileSystem.cachesDirectory.appending(... + "/ImagePicker")
  let path = fileSystem.generatePath(inDirectory: directory, ...)
  return URL(fileURLWithPath: path)
}
```

Every `uri:` in that file resolves through `generateUrl` or an already-cached
copy. There is no option that yields a `ph://` identifier. Two consequences:

1. Picking 50 × 25 MB RAW duplicates 1.25 GB into `Caches/` before a byte is sent.
2. `Caches/` is reclaimable. A long queue can outlive its own input files.

Owning selection in Swift keeps `PHAsset` identifiers and removes the copy.

## What is NOT a problem

**Image bytes never cross the bridge today.** Verified in React Native's source:
`Libraries/Network/FormData.js:91-100` returns a `{uri}` part as
`{...value, headers, fieldName}` — JS reads no file data — and
`Libraries/Network/RCTNetworking.mm:90` has native read the uri and stream the
file. So "large images over the bridge" is not the motivation for this work; the
disk duplication above is.

**Swift can consume SSE.** An earlier draft of this document claimed a background
`URLSession` cannot read a streaming response and concluded the server needed a
submit → `taskId` → poll contract. That was wrong and is retracted.
`URLSessionDataTask` with `URLSessionDataDelegate.urlSession(_:dataTask:didReceive:)`
receives bytes incrementally — that is how a native SSE client is written.

The one real restriction is narrow: a **background-configured** session does not
support data tasks, only upload and download tasks. Upload tasks still deliver
the response body to the data delegate, so even there the SSE bytes arrive; what
is unreliable is their *timing*, since callbacks are held until the app is woken
or relaunched. During that window nobody is watching a progress bar anyway, and
the final outcome still arrives.

**`be/apps/core` therefore needs no changes.** The existing SSE endpoint is
consumed directly from Swift.

One adjacent restriction surfaced during verification: a background session
also never calls `urlSession(_:dataTask:didReceive:completionHandler:)` — the
disposition callback cannot wait on a suspended app — so the HTTP status code
must be read from `task.response` in `didCompleteWithError`. The first build
read it from the skipped delegate method, every upload "failed" with status 0,
and the retry ladder re-uploaded each photo three times (the server dutifully
stored `-2`/`-3`/`-4` copies).

## What moving to Swift commits us to

1. **The queue moves into Swift.** `uploadQueue.ts` / `uploadQueueModel.ts` were
   built around an in-JS serial runner driving `sendSseRequest`. Authority for
   retry, cancel and ordering becomes native; JS keeps at most a mirror of
   native task state for rendering.
2. **Hand every task to the daemon rather than stepping the queue from app code.**
   A serial "start the next job when this one finishes" loop depends on app
   runtime that a suspended app does not have. Enqueue all upload tasks to the
   background session and let `nsurlsessiond` schedule them. This gives up strict
   serial ordering, which measurement says costs little: per-request overhead is
   ~80 ms against ~1.4 s of per-file server work, so batching versus one-at-a-time
   differed by ~5% (9.11 s vs 8.63 s for six files).
3. **Swift receives the session cookie across the bridge.** JS passes it down,
   keeping `authStorage.ts` the single keychain reader. But a background session
   can resume after the app is reclaimed, when no JS exists to supply a fresh
   value, and a cookie handed over hours earlier may have rotated. Native must
   persist what it was given and reload it on a background relaunch — holding
   only an in-memory copy is what breaks.
4. **Retry classification is re-expressed natively.** Keep the tested behaviour:
   4xx is terminal, transport failures and 5xx retry with backoff. Port the
   behaviour, not the code.
5. **`uploadTags.ts` stays in JS.** The server only trims the directory field, so
   path sanitisation is client-side and must match the dashboard exactly. JS
   computes the directory string and passes it down; Swift must not reimplement
   the sanitiser.

## Live Activity / Dynamic Island

A Live Activity is a **presentation surface**, not an execution grant. It does
not keep the app running and cannot hold the queue open. What keeps an upload
alive in the background is the background `URLSession` above.

Implemented: a Widget Extension target (`targets/widgets`, generated by
`@bacons/apple-targets`, bundle id `app.afilmory.widgets`) renders
`UploadActivityAttributes` in the island and on the lock screen;
`UploadActivityController` starts/updates/ends the activity from
`UploadCenter`'s emit path. Verified on simulator: compact island shows a
progress ring plus `done/total` while the app is backgrounded, and the
activity ends when the queue drains. The attributes struct is duplicated
verbatim in the app and extension targets — ActivityKit matches by type name
and Codable shape.

Release-pipeline note: the extension needs its own provisioning for TestFlight
(`app.afilmory.widgets`); simulator builds are unaffected. Live Activities
also have an active-duration ceiling (~8 h) and update-frequency budgets.

## Verified on simulator (local stack)

- Picker → review → upload → queue → done, with tag directory
  (`local-test/sim-upload/…`) and without (root). Singular/plural `{count}`
  templates, remove, addMore round-trip (JS re-picks and re-presents with
  state preserved), suggested tags with recent-first ordering, comma-committed
  draft tags.
- All tasks genuinely go to the daemon at once: 8 uploads landed within 200 ms
  of each other server-side.
- Cancel of an in-flight task kills the connection; a half-received body
  produces no server row; sibling uploads are unaffected; a cancelled Live
  Photo retried later paired correctly (`s-2.heic` + `s-2.mov`,
  `video.type: "live-photo"` in the manifest).
- Failure → 3 attempts → terminal `failed` with message; per-row Retry and
  Retry Failed both re-run from the persisted body file; queue state survives
  an app relaunch (`state.json` + `getAllTasks` reattach).
- Body files are deleted on success; Clear Finished removes rows and files.
- `PHImageManager` previews: `.fastFormat` requests fail with
  `PHPhotosErrorDomain 3303` for assets without a cached thumbnail — the
  preview writer uses a network-allowed `.highQualityFormat` request instead.

## Answered from the old Unverified list

- **Re-upload after a lost response is NOT idempotent.** The server keeps
  photo ids unique by suffixing (`IMG_0005-2.jpg`, `-3`, `-4`); duplicates
  accumulate rather than update. Confirmed empirically by the status-code bug
  above. Retry-on-uncertainty therefore trades reliability for possible
  suffixed duplicates.

## Still unverified

- Response delivery timing when the app is suspended or relaunched in the
  background (all verification ran foregrounded; the
  `handleEventsForBackgroundURLSession` subscriber is wired but unexercised).
- Reading `ph://` assets that are in iCloud but not downloaded locally
  (`isNetworkAccessAllowed` is set, but no iCloud library on the simulator).
- Limited photo access: picking outside the limited selection is rejected with
  a message rather than silently dropped, but this path has not been driven.
