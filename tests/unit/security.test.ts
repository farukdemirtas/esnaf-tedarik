import { describe, expect, it } from "vitest";
import { resolvePermissions, homePanel, ROLE_DEFINITIONS } from "@/lib/permissions";
import { checkPasswordPolicy, generateTempPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { decryptField, encryptField, maskId, sha256 } from "@/lib/crypto";
import { detectFileType, saveFile, readStoredFile, UploadError, validateUpload } from "@/lib/storage";
import { isSameOrigin, safeNextPath } from "@/lib/http";
import { redact } from "@/lib/audit";
import { normalizeUsername } from "@/lib/auth/username";

describe("izinler", () => {
  it("kişiye özel izin ekler ve kaldırır", () => {
    const p = resolvePermissions(["a", "b"], [
      { code: "c", granted: true },
      { code: "a", granted: false },
    ]);
    expect([...p].sort()).toEqual(["b", "c"]);
  });

  it("rollerin panel izinleri birbirinden ayrık", () => {
    const panels = (code: keyof typeof ROLE_DEFINITIONS) =>
      ROLE_DEFINITIONS[code].permissions.filter((p) => p.startsWith("panel."));
    expect(panels("CHAMBER_ADMIN")).toEqual(["panel.admin"]);
    expect(panels("CHAMBER_STAFF")).toEqual(["panel.staff"]);
    expect(panels("SUPPLIER_OWNER")).toEqual(["panel.supplier"]);
    expect(panels("SUPPLIER_STAFF")).toEqual(["panel.supplier"]);
    expect(panels("MEMBER_OWNER")).toEqual(["panel.member"]);
  });

  it("personel yönetici yetkilerine sahip değil", () => {
    const staff = new Set<string>(ROLE_DEFINITIONS.CHAMBER_STAFF.permissions);
    for (const p of ["user.manage", "supplier.approve", "campaign.review", "settings.manage", "audit.view", "member.setStatus"])
      expect(staff.has(p)).toBe(false);
  });

  it("tedarikçi çalışanı fiyat değiştiremez", () => {
    expect(ROLE_DEFINITIONS.SUPPLIER_STAFF.permissions).not.toContain("supplierSelf.pricing");
  });

  it("ana panel önceliği", () => {
    expect(homePanel(new Set(["panel.member"]))).toBe("member");
    expect(homePanel(new Set(["panel.staff", "panel.admin"]))).toBe("admin");
    expect(homePanel(new Set())).toBeNull();
  });
});

describe("şifre", () => {
  it("politika", () => {
    expect(checkPasswordPolicy("kisa1")).toMatch(/en az/);
    expect(checkPasswordPolicy("sadeceharfler")).toMatch(/rakam/);
    expect(checkPasswordPolicy("1234567890")).toMatch(/harf/);
    expect(checkPasswordPolicy("ahmet12345abc", "ahmet")).toMatch(/kullanıcı adı/);
    expect(checkPasswordPolicy("GüçlüŞifre2026")).toBeNull();
  });

  it("argon2id özet ve doğrulama", async () => {
    const h = await hashPassword("GüçlüŞifre2026");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "GüçlüŞifre2026")).toBe(true);
    expect(await verifyPassword(h, "yanlis")).toBe(false);
    expect(await verifyPassword("bozuk-ozet", "x")).toBe(false);
  });

  it("geçici şifre politikaya uyar", () => {
    for (let i = 0; i < 50; i++) expect(checkPasswordPolicy(generateTempPassword(12))).toBeNull();
  });
});

describe("şifreleme", () => {
  it("AES-GCM gidiş-dönüş ve kurcalama tespiti", () => {
    const enc = encryptField("12345678901");
    expect(enc).not.toContain("12345678901");
    expect(decryptField(enc)).toBe("12345678901");
    const parts = enc.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    expect(() => decryptField(parts.join("."))).toThrow();
  });

  it("maskeleme ve özet", () => {
    expect(maskId("12345678901")).toBe("123******01");
    expect(sha256("a")).toHaveLength(64);
  });

  it("denetim kaydında hassas alanlar gizlenir", () => {
    expect(redact({ username: "x", password: "y", nested: { tokenHash: "z" } })).toEqual({
      username: "x",
      password: "[gizli]",
      nested: { tokenHash: "[gizli]" },
    });
  });
});

describe("dosya depolama", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(32)]);

  it("türü içerikten belirler", () => {
    expect(detectFileType(png)?.mime).toBe("image/png");
    expect(detectFileType(pdf)?.mime).toBe("application/pdf");
    expect(detectFileType(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
  });

  it("izin verilmeyen türü reddeder", () => {
    expect(() => validateUpload(pdf, ["image"])).toThrow(UploadError);
  });

  it("kaydeder, okur ve yol geçişini engeller", async () => {
    const { key } = await saveFile("test/products", png, ["image"]);
    expect(key).toMatch(/^test\/products\/[A-Za-z0-9_-]+\.png$/);
    expect((await readStoredFile(key)).mime).toBe("image/png");
    await expect(readStoredFile("../../.env")).rejects.toThrow(UploadError);
    await expect(readStoredFile("test/../../x.png")).rejects.toThrow(UploadError);
    await expect(saveFile("../disari", png, ["image"])).rejects.toThrow(UploadError);
  });
});

describe("kullanıcı adı", () => {
  it("Türkçe I/ı/İ farkından etkilenmez", () => {
    expect(normalizeUsername("  TEST.UYE-1 ")).toBe("test.uye-1");
    expect(normalizeUsername("İLKADIM")).toBe("ilkadim");
    expect(normalizeUsername("ılkadım")).toBe("ilkadim");
  });
});

describe("http yardımcıları", () => {
  it("açık yönlendirmeyi engeller", () => {
    expect(safeNextPath("/magaza")).toBe("/magaza");
    expect(safeNextPath("//evil.com")).toBeNull();
    expect(safeNextPath("https://evil.com")).toBeNull();
    expect(safeNextPath("/\\evil.com")).toBeNull();
  });

  it("Origin kontrolü", () => {
    const req = (origin?: string) =>
      new Request("http://localhost:3000/api/x", {
        method: "POST",
        headers: { host: "localhost:3000", ...(origin ? { origin } : {}) },
      });
    expect(isSameOrigin(req("http://localhost:3000"))).toBe(true);
    expect(isSameOrigin(req("http://evil.com"))).toBe(false);
    expect(isSameOrigin(req())).toBe(false);
  });
});
