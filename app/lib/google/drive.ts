import { googleFetch, googleFetchAsUser, googleUserOAuthConfigured } from "./auth";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  md5Checksum?: string;
  size?: string;
  parents?: string[];
};

async function driveFetch(url: string, init: RequestInit = {}) {
  return (googleUserOAuthConfigured() ? googleFetchAsUser : googleFetch)(url, init);
}

export async function getDriveFile(fileId: string): Promise<DriveFile> {
  const fields = "id,name,mimeType,modifiedTime,md5Checksum,size,parents";
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`);
  return await response.json() as DriveFile;
}

export async function listDriveChildren(folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken = "";
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", `'${folderId}' in parents and trashed=false`);
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,size,parents)");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await driveFetch(url.toString());
    const body = await response.json() as { nextPageToken?: string; files?: DriveFile[] };
    files.push(...(body.files ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return files;
}

export async function searchDriveFiles(query: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken = "";
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", `${query} and trashed=false`);
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,size,parents)");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await driveFetch(url.toString());
    const body = await response.json() as { nextPageToken?: string; files?: DriveFile[] };
    files.push(...(body.files ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return files;
}

export async function downloadDriveFile(fileId: string) {
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType };
}

export async function uploadDriveFile(options: { name: string; parentId: string; bytes: Uint8Array; mimeType: string }) {
  const boundary = `cortifree_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const metadata = JSON.stringify({ name: options.name, parents: [options.parentId] });
  const prefix = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${options.mimeType}\r\n\r\n`);
  const suffix = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([prefix, Buffer.from(options.bytes), suffix]);
  const fetcher = googleUserOAuthConfigured() ? googleFetchAsUser : googleFetch;
  const response = await fetcher("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,parents,webViewLink", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return await response.json() as DriveFile & { webViewLink?: string };
}
