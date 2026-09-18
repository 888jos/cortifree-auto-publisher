import { googleFetch } from "./auth";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  md5Checksum?: string;
  size?: string;
  parents?: string[];
};

export async function getDriveFile(fileId: string): Promise<DriveFile> {
  const fields = "id,name,mimeType,modifiedTime,md5Checksum,size,parents";
  const response = await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`);
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
    const response = await googleFetch(url.toString());
    const body = await response.json() as { nextPageToken?: string; files?: DriveFile[] };
    files.push(...(body.files ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return files;
}

export async function downloadDriveFile(fileId: string) {
  const response = await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType };
}
