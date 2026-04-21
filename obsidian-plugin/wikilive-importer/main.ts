import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  RequestUrlResponse,
  Setting,
  TFile,
  normalizePath,
  requestUrl,
} from "obsidian";

type ImportMode = "current_file" | "files" | "folder" | "folder_recursive" | "vault";
type ConflictResolution = "skip" | "replace" | "create_copy";
type FolderStrategy = "preserve" | "flat";

type WikiLiveImporterSettings = {
  baseUrl: string;
  selectedSpaceId: string;
  lastMode: ImportMode;
  lastFolderPath: string;
  lastFilePaths: string;
  folderStrategy: FolderStrategy;
  defaultConflictResolution: ConflictResolution;
};

type ObsidianSpace = {
  id: string;
  name: string;
};

type ImportPreviewItem = {
  path: string;
  folderPath: string;
  fileName: string;
  pageTitle: string;
  status: "new" | "conflict";
  existingPageId: string | null;
  existingPageTitle: string | null;
  suggestedResolution: ConflictResolution;
};

type ImportPreviewResponse = {
  mode: string;
  folderStrategy: FolderStrategy;
  items: ImportPreviewItem[];
  summary: {
    totalFiles: number;
    newPages: number;
    conflicts: number;
  };
};

type ImportRunResponse = {
  items: Array<{
    path: string;
    action: "created" | "replaced" | "skipped";
    pageId?: string;
    pageTitle?: string;
    reason?: string;
  }>;
  summary: {
    totalFiles: number;
    imported: number;
    skipped: number;
  };
};

type ImportAttachmentPayload = {
  path: string;
  name: string;
  dataUrl: string;
};

type ImportFilePayload = {
  path: string;
  name: string;
  markdown: string;
  attachments?: ImportAttachmentPayload[];
};

const DEFAULT_SETTINGS: WikiLiveImporterSettings = {
  baseUrl: "http://localhost:8080",
  selectedSpaceId: "",
  lastMode: "current_file",
  lastFolderPath: "",
  lastFilePaths: "",
  folderStrategy: "preserve",
  defaultConflictResolution: "skip",
};

const API_KEY_SECRET_ID = "wikilive-importer-api-key";

export default class WikiLiveImporterPlugin extends Plugin {
  settings: WikiLiveImporterSettings = DEFAULT_SETTINGS;
  private cachedSpaces: ObsidianSpace[] = [];

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new WikiLiveImporterSettingTab(this.app, this));
    this.addRibbonIcon("upload", "Импортировать в WikiLive", () => {
      new WikiLiveImportModal(this.app, this).open();
    });
    this.addCommand({
      id: "open-wikilive-import",
      name: "Открыть импорт в WikiLive",
      callback: () => new WikiLiveImportModal(this.app, this).open(),
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getApiKey(): string | null {
    return this.app.secretStorage.getSecret(API_KEY_SECRET_ID);
  }

  saveApiKey(value: string) {
    this.app.secretStorage.setSecret(API_KEY_SECRET_ID, value.trim());
  }

  async validateApiKey(apiKey: string): Promise<ObsidianSpace[]> {
    const response = await this.postJson<{ items: ObsidianSpace[] }>("/api/v1/obsidian/spaces", {
      apiKey,
    });
    this.cachedSpaces = response.items ?? [];

    if (!this.settings.selectedSpaceId && this.cachedSpaces.length > 0) {
      this.settings.selectedSpaceId = this.cachedSpaces[0].id;
      await this.saveSettings();
    }

    return this.cachedSpaces;
  }

  async previewImport(payload: Record<string, unknown>): Promise<ImportPreviewResponse> {
    return this.postJson<ImportPreviewResponse>("/api/v1/obsidian/import/preview", payload);
  }

  async runImport(payload: Record<string, unknown>): Promise<ImportRunResponse> {
    return this.postJson<ImportRunResponse>("/api/v1/obsidian/import", payload);
  }

  async collectFiles(
    mode: ImportMode,
    folderPath: string,
    filePathsRaw: string,
    options: { includeAttachments: boolean },
  ): Promise<ImportFilePayload[]> {
    const vault = this.app.vault;

    if (mode === "current_file") {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile || !(activeFile instanceof TFile) || activeFile.extension !== "md") {
        throw new Error("Открой Markdown-файл перед импортом текущей заметки");
      }
      return [await this.buildImportFile(activeFile, options)];
    }

    if (mode === "vault") {
      const markdownFiles = vault.getMarkdownFiles();
      return Promise.all(markdownFiles.map((file) => this.buildImportFile(file, options)));
    }

    if (mode === "files") {
      const rawPaths = filePathsRaw
        .split(/\r?\n|,/)
        .map((value) => value.trim())
        .filter(Boolean);
      if (rawPaths.length === 0) {
        throw new Error("Укажи хотя бы один путь к Markdown-файлу");
      }

      const files = rawPaths
        .map((path) => vault.getAbstractFileByPath(path))
        .filter((entry): entry is TFile => entry instanceof TFile && entry.extension === "md");

      if (files.length === 0) {
        throw new Error("Не удалось найти Markdown-файлы по указанным путям");
      }

      return Promise.all(files.map((file) => this.buildImportFile(file, options)));
    }

    const normalizedFolderPath = folderPath.trim().replace(/\\/g, "/");
    if (!normalizedFolderPath) {
      throw new Error("Укажи путь к папке внутри vault");
    }

    const markdownFiles = vault.getMarkdownFiles().filter((file) => {
      const fileDir = file.parent?.path ?? "";
      if (mode === "folder") {
        return fileDir === normalizedFolderPath;
      }
      return file.path.startsWith(`${normalizedFolderPath}/`) || fileDir === normalizedFolderPath;
    });

    if (markdownFiles.length === 0) {
      throw new Error("В выбранной папке не найдено Markdown-файлов");
    }

    return Promise.all(markdownFiles.map((file) => this.buildImportFile(file, options)));
  }

  private async postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await requestUrl({
      url: `${this.settings.baseUrl.replace(/\/$/, "")}${path}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return this.parseJsonResponse<T>(response);
  }

  private parseJsonResponse<T>(response: RequestUrlResponse): T {
    if (response.status >= 200 && response.status < 300) {
      return response.json as T;
    }

    const error = response.json as { message?: string; error?: string } | undefined;
    throw new Error(error?.message || error?.error || `Запрос завершился ошибкой ${response.status}`);
  }

  private async buildImportFile(file: TFile, options: { includeAttachments: boolean }): Promise<ImportFilePayload> {
    const markdown = await this.app.vault.read(file);

    return {
      path: file.path,
      name: file.name,
      markdown,
      attachments: options.includeAttachments ? await this.collectImageAttachments(file, markdown) : [],
    };
  }

  private async collectImageAttachments(file: TFile, markdown: string): Promise<ImportAttachmentPayload[]> {
    const refs = this.extractImageReferences(markdown);
    const attachments: ImportAttachmentPayload[] = [];
    const seenRefs = new Set<string>();

    for (const ref of refs) {
      const target = this.resolveAttachmentFile(file, ref);
      const normalizedRef = normalizePath(ref.replace(/\\/g, "/"));
      if (!target || seenRefs.has(normalizedRef)) {
        continue;
      }

      const mimeType = this.getMimeTypeForFile(target);
      if (!mimeType) {
        continue;
      }

      const binary = await this.app.vault.readBinary(target);
      const dataUrl = this.arrayBufferToDataUrl(binary, mimeType);
      attachments.push({
        path: normalizedRef,
        name: target.name,
        dataUrl,
      });
      seenRefs.add(normalizedRef);
    }

    return attachments;
  }

  private extractImageReferences(markdown: string): string[] {
    const refs = new Set<string>();

    for (const match of markdown.matchAll(/!\[.*?\]\((.*?)\)/g)) {
      const raw = (match[1] ?? "").trim().replace(/^<|>$/g, "");
      if (!raw || this.isRemoteImageReference(raw)) {
        continue;
      }
      refs.add(raw);
    }

    for (const match of markdown.matchAll(/!\[\[([^\]]+)\]\]/g)) {
      const raw = (match[1] ?? "").split("|")[0]?.trim() ?? "";
      if (!raw || this.isRemoteImageReference(raw)) {
        continue;
      }
      refs.add(raw);
    }

    return [...refs];
  }

  private resolveAttachmentFile(sourceFile: TFile, reference: string): TFile | null {
    const cleaned = reference.trim().replace(/^<|>$/g, "");
    const wikilinkResolved = this.app.metadataCache.getFirstLinkpathDest(cleaned, sourceFile.path);
    if (wikilinkResolved && this.isImageFile(wikilinkResolved)) {
      return wikilinkResolved;
    }

    const sourceDir = sourceFile.parent?.path ?? "";
    const combined = sourceDir ? normalizePath(`${sourceDir}/${cleaned}`) : normalizePath(cleaned);
    const direct = this.app.vault.getAbstractFileByPath(combined);
    if (direct instanceof TFile && this.isImageFile(direct)) {
      return direct;
    }

    const absolute = this.app.vault.getAbstractFileByPath(normalizePath(cleaned));
    if (absolute instanceof TFile && this.isImageFile(absolute)) {
      return absolute;
    }

    return null;
  }

  private isRemoteImageReference(reference: string): boolean {
    return /^(https?:)?\/\//i.test(reference) || /^data:/i.test(reference);
  }

  private isImageFile(file: TFile): boolean {
    return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(file.extension.toLowerCase());
  }

  private getMimeTypeForFile(file: TFile): string | null {
    const extension = file.extension.toLowerCase();
    const mimeByExtension: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      bmp: "image/bmp",
    };

    return mimeByExtension[extension] ?? null;
  }

  private arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return `data:${mimeType};base64,${btoa(binary)}`;
  }
}

class WikiLiveImporterSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: WikiLiveImporterPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Адрес backend")
      .setDesc("Адрес backend WikiLive. По умолчанию используется локальный сервер на порту 8080.")
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:8080")
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value.trim() || DEFAULT_SETTINGS.baseUrl;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Действие при конфликте")
      .setDesc("Что делать по умолчанию, если страница с таким названием уже существует.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("skip", "Пропускать")
          .addOption("replace", "Заменять существующую")
          .addOption("create_copy", "Создавать копию")
          .setValue(this.plugin.settings.defaultConflictResolution)
          .onChange(async (value) => {
            this.plugin.settings.defaultConflictResolution = value as ConflictResolution;
            await this.plugin.saveSettings();
          }),
      );
  }
}

class WikiLiveImportModal extends Modal {
  private apiKey = "";
  private isApiKeyValid = false;
  private isValidating = false;
  private mode: ImportMode;
  private folderPath: string;
  private filePaths: string;
  private selectedSpaceId: string;
  private spaces: ObsidianSpace[];
  private isImporting = false;
  private importStatusMessage = "";

  constructor(app: App, private readonly plugin: WikiLiveImporterPlugin) {
    super(app);
    this.apiKey = plugin.getApiKey() ?? "";
    this.mode = plugin.settings.lastMode;
    this.folderPath = plugin.settings.lastFolderPath;
    this.filePaths = plugin.settings.lastFilePaths;
    this.selectedSpaceId = plugin.settings.selectedSpaceId;
    this.spaces = [];
  }

  onOpen() {
    this.render();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Импорт в WikiLive" });

    if (!this.isApiKeyValid) {
      this.renderApiKeyStep(contentEl);
      return;
    }

    this.renderImportStep(contentEl);
  }

  private renderApiKeyStep(containerEl: HTMLElement) {
    new Setting(containerEl)
      .setName("Адрес backend")
      .setDesc("Укажи адрес backend WikiLive. Для локальной проверки обычно это http://localhost:8080.")
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:8080")
          .setValue(this.plugin.settings.baseUrl)
          .onChange((value) => {
            this.plugin.settings.baseUrl = value.trim() || DEFAULT_SETTINGS.baseUrl;
          }),
      );

    new Setting(containerEl)
      .setName("API-ключ")
      .setDesc("Вставь API-ключ. Пока ключ не пройдет проверку, остальные поля будут скрыты.")
      .addText((text) =>
        text
          .setPlaceholder("usk...")
          .setValue(this.apiKey)
          .onChange((value) => {
            this.apiKey = value.trim();
          }),
      )
      .addButton((button) =>
        button
          .setCta()
          .setButtonText(this.isValidating ? "Проверяем..." : "Проверить")
          .setDisabled(this.isValidating)
          .onClick(async () => {
            try {
              await this.handleApiKeyValidation();
            } catch (error) {
              new Notice(error instanceof Error ? error.message : "Не удалось проверить ключ");
            }
          }),
      );

    containerEl.createDiv({
      cls: "wikilive-importer-help",
      text: `Сейчас используется backend: ${this.plugin.settings.baseUrl}`,
    });
  }

  private renderImportStep(containerEl: HTMLElement) {
    containerEl.createDiv({
      cls: "wikilive-importer-help",
      text: `Ключ подтвержден. Найдено пространств: ${this.spaces.length}.`,
    });

    if (this.importStatusMessage) {
      containerEl.createDiv({
        cls: "wikilive-importer-help",
        text: this.importStatusMessage,
      });
    }

    new Setting(containerEl)
      .setName("Режим импорта")
      .setDesc("Выбери, что именно нужно импортировать из текущего vault.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("current_file", "Текущую заметку")
          .addOption("files", "Конкретные файлы")
          .addOption("folder", "Одну папку")
          .addOption("folder_recursive", "Папку рекурсивно")
          .addOption("vault", "Весь vault")
          .setValue(this.mode)
          .onChange((value) => {
            this.mode = value as ImportMode;
            this.render();
          }),
      );

    new Setting(containerEl)
      .setName("Структура папок")
      .setDesc("Сохранять структуру папок Obsidian в WikiLive или импортировать все в один уровень.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("preserve", "Сохранять структуру")
          .addOption("flat", "Импортировать плоско")
          .setValue(this.plugin.settings.folderStrategy)
          .onChange(async (value) => {
            this.plugin.settings.folderStrategy = value as FolderStrategy;
            await this.plugin.saveSettings();
          }),
      );

    if (this.mode === "folder" || this.mode === "folder_recursive") {
      new Setting(containerEl)
        .setName("Путь к папке")
        .setDesc("Путь относительно vault, например `Projects` или `Notes/2026`.")
        .addText((text) =>
          text
            .setPlaceholder("Путь к папке")
            .setValue(this.folderPath)
            .onChange((value) => {
              this.folderPath = value.trim();
            }),
        );
    }

    if (this.mode === "files") {
      const wrapper = containerEl.createDiv({ cls: "wikilive-importer-paths" });
      wrapper.createEl("label", { text: "Пути к Markdown-файлам" });
      const textarea = wrapper.createEl("textarea");
      textarea.value = this.filePaths;
      textarea.placeholder = "Notes/Plan.md\nProjects/Roadmap.md";
      textarea.addEventListener("input", () => {
        this.filePaths = textarea.value;
      });
    }

    new Setting(containerEl)
      .setName("Пространство WikiLive")
      .setDesc("Выбери пространство, в которое будет выполнен импорт.")
      .addDropdown((dropdown) => {
        for (const space of this.spaces) {
          dropdown.addOption(space.id, space.name);
        }
        dropdown.setValue(this.selectedSpaceId || this.spaces[0]?.id || "");
        dropdown.onChange((value) => {
          this.selectedSpaceId = value;
        });
      });

    new Setting(containerEl)
      .setName("Запуск импорта")
      .setDesc("Сначала будет выполнен preview, затем при необходимости будет предложено действие для конфликтов.")
      .addButton((button) =>
        button
          .setCta()
          .setButtonText(this.isImporting ? "Импортируем..." : "Импортировать")
          .setDisabled(this.isImporting)
          .onClick(async () => {
            try {
              await this.handleImport();
            } catch (error) {
              this.isImporting = false;
              this.importStatusMessage = "";
              this.render();
              new Notice(error instanceof Error ? error.message : "Импорт завершился ошибкой");
            }
          }),
      );

    containerEl.createDiv({
      cls: "wikilive-importer-help",
      text: "Локальные изображения из Obsidian vault импортируются вместе с Markdown. Вложения не-изображения пока пропускаются.",
    });
  }

  private async handleApiKeyValidation() {
    const trimmedKey = this.apiKey.trim();
    if (!trimmedKey) {
      throw new Error("Вставь API-ключ перед проверкой");
    }

    this.plugin.settings.baseUrl = this.plugin.settings.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl;
    await this.plugin.saveSettings();

    this.isValidating = true;
    this.render();

    try {
      const spaces = await this.plugin.validateApiKey(trimmedKey);
      if (spaces.length === 0) {
        throw new Error("Ключ валиден, но доступных пространств не найдено");
      }

      this.plugin.saveApiKey(trimmedKey);
      this.spaces = spaces;
      this.selectedSpaceId = this.plugin.settings.selectedSpaceId || spaces[0].id;
      this.isApiKeyValid = true;
      new Notice(`Ключ подтвержден. Доступно пространств: ${spaces.length}`);
      this.render();
    } finally {
      this.isValidating = false;
    }
  }

  private async handleImport() {
    const apiKey = this.plugin.getApiKey();
    if (!apiKey) {
      throw new Error("Сначала укажи и подтверди API-ключ");
    }
    if (!this.selectedSpaceId) {
      throw new Error("Выбери пространство WikiLive");
    }

    this.isImporting = true;
    this.importStatusMessage = "Подготавливаем markdown-файлы для preview...";
    this.render();

    const previewFiles = await this.plugin.collectFiles(this.mode, this.folderPath, this.filePaths, {
      includeAttachments: false,
    });
    this.plugin.settings.lastMode = this.mode;
    this.plugin.settings.lastFolderPath = this.folderPath;
    this.plugin.settings.lastFilePaths = this.filePaths;
    this.plugin.settings.selectedSpaceId = this.selectedSpaceId;
    await this.plugin.saveSettings();

    this.importStatusMessage = "Отправляем preview в WikiLive...";
    this.render();
    const preview = await this.plugin.previewImport({
      apiKey,
      spaceId: this.selectedSpaceId,
      mode: this.mode,
      folderStrategy: this.plugin.settings.folderStrategy,
      files: previewFiles,
    });

    let conflictResolution = this.plugin.settings.defaultConflictResolution;
    if (preview.summary.conflicts > 0) {
      this.isImporting = false;
      this.importStatusMessage = "";
      this.render();
      conflictResolution = await new ConflictResolutionModal(
        this.app,
        preview,
        this.plugin.settings.defaultConflictResolution,
      ).openAndWait();
      this.isImporting = true;
      this.importStatusMessage = "Подготавливаем изображения и вложения для финального импорта...";
      this.render();
    }

    const files = await this.plugin.collectFiles(this.mode, this.folderPath, this.filePaths, {
      includeAttachments: true,
    });

    this.importStatusMessage = "Загружаем данные в WikiLive...";
    this.render();
    const result = await this.plugin.runImport({
      apiKey,
      spaceId: this.selectedSpaceId,
      mode: this.mode,
      folderStrategy: this.plugin.settings.folderStrategy,
      defaultConflictResolution: conflictResolution,
      files,
    });

    this.isImporting = false;
    this.importStatusMessage = "";
    new Notice(`Импорт завершен: ${result.summary.imported} импортировано, ${result.summary.skipped} пропущено`);
    this.close();
  }
}

class ConflictResolutionModal extends Modal {
  private resolution: ConflictResolution;
  private resolver!: (value: ConflictResolution) => void;
  private settled = false;

  constructor(
    app: App,
    private readonly preview: ImportPreviewResponse,
    initialResolution: ConflictResolution,
  ) {
    super(app);
    this.resolution = initialResolution;
  }

  openAndWait(): Promise<ConflictResolution> {
    this.open();
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Найдены конфликты" });
    contentEl.createEl("p", {
      text: `${this.preview.summary.conflicts} файлов совпали с уже существующими страницами в целевой папке.`,
    });

    const list = contentEl.createEl("ul");
    this.preview.items
      .filter((item) => item.status === "conflict")
      .slice(0, 12)
      .forEach((item) => {
        list.createEl("li", {
          text: `${item.path} -> ${item.existingPageTitle || item.pageTitle}`,
        });
      });

    new Setting(contentEl)
      .setName("Что делать с конфликтами")
      .setDesc("Выбери действие для текущего запуска импорта.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("skip", "Пропустить конфликтующие файлы")
          .addOption("replace", "Заменить существующие страницы")
          .addOption("create_copy", "Создать копии")
          .setValue(this.resolution)
          .onChange((value) => {
            this.resolution = value as ConflictResolution;
          }),
      );

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText("Отмена").onClick(() => {
          this.settle("skip");
        }),
      )
      .addButton((button) =>
        button.setCta().setButtonText("Продолжить").onClick(() => {
          this.settle(this.resolution);
        }),
      );
  }

  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settle("skip");
    }
  }

  private settle(value: ConflictResolution) {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.close();
    this.resolver?.(value);
  }
}
