"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => WikiLiveImporterPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  baseUrl: "http://localhost:8080",
  selectedSpaceId: "",
  lastMode: "current_file",
  lastFolderPath: "",
  lastFilePaths: "",
  folderStrategy: "preserve",
  defaultConflictResolution: "skip"
};
var API_KEY_SECRET_ID = "wikilive-importer-api-key";
var WikiLiveImporterPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.cachedSpaces = [];
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new WikiLiveImporterSettingTab(this.app, this));
    this.addRibbonIcon("upload", "\u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0432 WikiLive", () => {
      new WikiLiveImportModal(this.app, this).open();
    });
    this.addCommand({
      id: "open-wikilive-import",
      name: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0438\u043C\u043F\u043E\u0440\u0442 \u0432 WikiLive",
      callback: () => new WikiLiveImportModal(this.app, this).open()
    });
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  getApiKey() {
    return this.app.secretStorage.getSecret(API_KEY_SECRET_ID);
  }
  saveApiKey(value) {
    this.app.secretStorage.setSecret(API_KEY_SECRET_ID, value.trim());
  }
  async validateApiKey(apiKey) {
    const response = await this.postJson("/api/v1/obsidian/spaces", {
      apiKey
    });
    this.cachedSpaces = response.items ?? [];
    if (!this.settings.selectedSpaceId && this.cachedSpaces.length > 0) {
      this.settings.selectedSpaceId = this.cachedSpaces[0].id;
      await this.saveSettings();
    }
    return this.cachedSpaces;
  }
  async previewImport(payload) {
    return this.postJson("/api/v1/obsidian/import/preview", payload);
  }
  async runImport(payload) {
    return this.postJson("/api/v1/obsidian/import", payload);
  }
  async collectFiles(mode, folderPath, filePathsRaw) {
    const vault = this.app.vault;
    if (mode === "current_file") {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile || !(activeFile instanceof import_obsidian.TFile) || activeFile.extension !== "md") {
        throw new Error("\u041E\u0442\u043A\u0440\u043E\u0439 Markdown-\u0444\u0430\u0439\u043B \u043F\u0435\u0440\u0435\u0434 \u0438\u043C\u043F\u043E\u0440\u0442\u043E\u043C \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u0437\u0430\u043C\u0435\u0442\u043A\u0438");
      }
      return [{ path: activeFile.path, name: activeFile.name, markdown: await vault.read(activeFile) }];
    }
    if (mode === "vault") {
      const markdownFiles2 = vault.getMarkdownFiles();
      return Promise.all(markdownFiles2.map(async (file) => ({
        path: file.path,
        name: file.name,
        markdown: await vault.read(file)
      })));
    }
    if (mode === "files") {
      const rawPaths = filePathsRaw.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean);
      if (rawPaths.length === 0) {
        throw new Error("\u0423\u043A\u0430\u0436\u0438 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u0438\u043D \u043F\u0443\u0442\u044C \u043A Markdown-\u0444\u0430\u0439\u043B\u0443");
      }
      const files = rawPaths.map((path) => vault.getAbstractFileByPath(path)).filter((entry) => entry instanceof import_obsidian.TFile && entry.extension === "md");
      if (files.length === 0) {
        throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0439\u0442\u0438 Markdown-\u0444\u0430\u0439\u043B\u044B \u043F\u043E \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u043C \u043F\u0443\u0442\u044F\u043C");
      }
      return Promise.all(files.map(async (file) => ({
        path: file.path,
        name: file.name,
        markdown: await vault.read(file)
      })));
    }
    const normalizedFolderPath = folderPath.trim().replace(/\\/g, "/");
    if (!normalizedFolderPath) {
      throw new Error("\u0423\u043A\u0430\u0436\u0438 \u043F\u0443\u0442\u044C \u043A \u043F\u0430\u043F\u043A\u0435 \u0432\u043D\u0443\u0442\u0440\u0438 vault");
    }
    const markdownFiles = vault.getMarkdownFiles().filter((file) => {
      const fileDir = file.parent?.path ?? "";
      if (mode === "folder") {
        return fileDir === normalizedFolderPath;
      }
      return file.path.startsWith(`${normalizedFolderPath}/`) || fileDir === normalizedFolderPath;
    });
    if (markdownFiles.length === 0) {
      throw new Error("\u0412 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u043F\u0430\u043F\u043A\u0435 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E Markdown-\u0444\u0430\u0439\u043B\u043E\u0432");
    }
    return Promise.all(markdownFiles.map(async (file) => ({
      path: file.path,
      name: file.name,
      markdown: await vault.read(file)
    })));
  }
  async postJson(path, body) {
    const response = await (0, import_obsidian.requestUrl)({
      url: `${this.settings.baseUrl.replace(/\/$/, "")}${path}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    return this.parseJsonResponse(response);
  }
  parseJsonResponse(response) {
    if (response.status >= 200 && response.status < 300) {
      return response.json;
    }
    const error = response.json;
    throw new Error(error?.message || error?.error || `\u0417\u0430\u043F\u0440\u043E\u0441 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B\u0441\u044F \u043E\u0448\u0438\u0431\u043A\u043E\u0439 ${response.status}`);
  }
};
var WikiLiveImporterSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("\u0410\u0434\u0440\u0435\u0441 backend").setDesc("\u0410\u0434\u0440\u0435\u0441 backend WikiLive. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0441\u0435\u0440\u0432\u0435\u0440 \u043D\u0430 \u043F\u043E\u0440\u0442\u0443 8080.").addText(
      (text) => text.setPlaceholder("http://localhost:8080").setValue(this.plugin.settings.baseUrl).onChange(async (value) => {
        this.plugin.settings.baseUrl = value.trim() || DEFAULT_SETTINGS.baseUrl;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043F\u0440\u0438 \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u0435").setDesc("\u0427\u0442\u043E \u0434\u0435\u043B\u0430\u0442\u044C \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E, \u0435\u0441\u043B\u0438 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u0441 \u0442\u0430\u043A\u0438\u043C \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435\u043C \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442.").addDropdown(
      (dropdown) => dropdown.addOption("skip", "\u041F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u0442\u044C").addOption("replace", "\u0417\u0430\u043C\u0435\u043D\u044F\u0442\u044C \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0443\u044E").addOption("create_copy", "\u0421\u043E\u0437\u0434\u0430\u0432\u0430\u0442\u044C \u043A\u043E\u043F\u0438\u044E").setValue(this.plugin.settings.defaultConflictResolution).onChange(async (value) => {
        this.plugin.settings.defaultConflictResolution = value;
        await this.plugin.saveSettings();
      })
    );
  }
};
var WikiLiveImportModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.apiKey = "";
    this.isApiKeyValid = false;
    this.isValidating = false;
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
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "\u0418\u043C\u043F\u043E\u0440\u0442 \u0432 WikiLive" });
    if (!this.isApiKeyValid) {
      this.renderApiKeyStep(contentEl);
      return;
    }
    this.renderImportStep(contentEl);
  }
  renderApiKeyStep(containerEl) {
    new import_obsidian.Setting(containerEl).setName("\u0410\u0434\u0440\u0435\u0441 backend").setDesc("\u0423\u043A\u0430\u0436\u0438 \u0430\u0434\u0440\u0435\u0441 backend WikiLive. \u0414\u043B\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043E\u0431\u044B\u0447\u043D\u043E \u044D\u0442\u043E http://localhost:8080.").addText(
      (text) => text.setPlaceholder("http://localhost:8080").setValue(this.plugin.settings.baseUrl).onChange((value) => {
        this.plugin.settings.baseUrl = value.trim() || DEFAULT_SETTINGS.baseUrl;
      })
    );
    new import_obsidian.Setting(containerEl).setName("API-\u043A\u043B\u044E\u0447").setDesc("\u0412\u0441\u0442\u0430\u0432\u044C API-\u043A\u043B\u044E\u0447. \u041F\u043E\u043A\u0430 \u043A\u043B\u044E\u0447 \u043D\u0435 \u043F\u0440\u043E\u0439\u0434\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443, \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u043F\u043E\u043B\u044F \u0431\u0443\u0434\u0443\u0442 \u0441\u043A\u0440\u044B\u0442\u044B.").addText(
      (text) => text.setPlaceholder("usk...").setValue(this.apiKey).onChange((value) => {
        this.apiKey = value.trim();
      })
    ).addButton(
      (button) => button.setCta().setButtonText(this.isValidating ? "\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u043C..." : "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C").setDisabled(this.isValidating).onClick(async () => {
        try {
          await this.handleApiKeyValidation();
        } catch (error) {
          new import_obsidian.Notice(error instanceof Error ? error.message : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043A\u043B\u044E\u0447");
        }
      })
    );
    containerEl.createDiv({
      cls: "wikilive-importer-help",
      text: `\u0421\u0435\u0439\u0447\u0430\u0441 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F backend: ${this.plugin.settings.baseUrl}`
    });
  }
  renderImportStep(containerEl) {
    containerEl.createDiv({
      cls: "wikilive-importer-help",
      text: `\u041A\u043B\u044E\u0447 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D. \u041D\u0430\u0439\u0434\u0435\u043D\u043E \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432: ${this.spaces.length}.`
    });
    new import_obsidian.Setting(containerEl).setName("\u0420\u0435\u0436\u0438\u043C \u0438\u043C\u043F\u043E\u0440\u0442\u0430").setDesc("\u0412\u044B\u0431\u0435\u0440\u0438, \u0447\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u043D\u0443\u0436\u043D\u043E \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0438\u0437 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E vault.").addDropdown(
      (dropdown) => dropdown.addOption("current_file", "\u0422\u0435\u043A\u0443\u0449\u0443\u044E \u0437\u0430\u043C\u0435\u0442\u043A\u0443").addOption("files", "\u041A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B").addOption("folder", "\u041E\u0434\u043D\u0443 \u043F\u0430\u043F\u043A\u0443").addOption("folder_recursive", "\u041F\u0430\u043F\u043A\u0443 \u0440\u0435\u043A\u0443\u0440\u0441\u0438\u0432\u043D\u043E").addOption("vault", "\u0412\u0435\u0441\u044C vault").setValue(this.mode).onChange((value) => {
        this.mode = value;
        this.render();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430 \u043F\u0430\u043F\u043E\u043A").setDesc("\u0421\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u044C \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0443 \u043F\u0430\u043F\u043E\u043A Obsidian \u0432 WikiLive \u0438\u043B\u0438 \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0432\u0441\u0435 \u0432 \u043E\u0434\u0438\u043D \u0443\u0440\u043E\u0432\u0435\u043D\u044C.").addDropdown(
      (dropdown) => dropdown.addOption("preserve", "\u0421\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u044C \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0443").addOption("flat", "\u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043B\u043E\u0441\u043A\u043E").setValue(this.plugin.settings.folderStrategy).onChange(async (value) => {
        this.plugin.settings.folderStrategy = value;
        await this.plugin.saveSettings();
      })
    );
    if (this.mode === "folder" || this.mode === "folder_recursive") {
      new import_obsidian.Setting(containerEl).setName("\u041F\u0443\u0442\u044C \u043A \u043F\u0430\u043F\u043A\u0435").setDesc("\u041F\u0443\u0442\u044C \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u043E vault, \u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440 `Projects` \u0438\u043B\u0438 `Notes/2026`.").addText(
        (text) => text.setPlaceholder("\u041F\u0443\u0442\u044C \u043A \u043F\u0430\u043F\u043A\u0435").setValue(this.folderPath).onChange((value) => {
          this.folderPath = value.trim();
        })
      );
    }
    if (this.mode === "files") {
      const wrapper = containerEl.createDiv({ cls: "wikilive-importer-paths" });
      wrapper.createEl("label", { text: "\u041F\u0443\u0442\u0438 \u043A Markdown-\u0444\u0430\u0439\u043B\u0430\u043C" });
      const textarea = wrapper.createEl("textarea");
      textarea.value = this.filePaths;
      textarea.placeholder = "Notes/Plan.md\nProjects/Roadmap.md";
      textarea.addEventListener("input", () => {
        this.filePaths = textarea.value;
      });
    }
    new import_obsidian.Setting(containerEl).setName("\u041F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u043E WikiLive").setDesc("\u0412\u044B\u0431\u0435\u0440\u0438 \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u043E, \u0432 \u043A\u043E\u0442\u043E\u0440\u043E\u0435 \u0431\u0443\u0434\u0435\u0442 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D \u0438\u043C\u043F\u043E\u0440\u0442.").addDropdown((dropdown) => {
      for (const space of this.spaces) {
        dropdown.addOption(space.id, space.name);
      }
      dropdown.setValue(this.selectedSpaceId || this.spaces[0]?.id || "");
      dropdown.onChange((value) => {
        this.selectedSpaceId = value;
      });
    });
    new import_obsidian.Setting(containerEl).setName("\u0417\u0430\u043F\u0443\u0441\u043A \u0438\u043C\u043F\u043E\u0440\u0442\u0430").setDesc("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0431\u0443\u0434\u0435\u0442 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D preview, \u0437\u0430\u0442\u0435\u043C \u043F\u0440\u0438 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u043E\u0441\u0442\u0438 \u0431\u0443\u0434\u0435\u0442 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0434\u043B\u044F \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u043E\u0432.").addButton(
      (button) => button.setCta().setButtonText("\u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C").onClick(async () => {
        try {
          await this.handleImport();
        } catch (error) {
          new import_obsidian.Notice(error instanceof Error ? error.message : "\u0418\u043C\u043F\u043E\u0440\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B\u0441\u044F \u043E\u0448\u0438\u0431\u043A\u043E\u0439");
        }
      })
    );
    containerEl.createDiv({
      cls: "wikilive-importer-help",
      text: "\u041A\u0430\u0440\u0442\u0438\u043D\u043A\u0438 \u0438 \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043F\u043E\u043A\u0430 \u043D\u0435 \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u044E\u0442\u0441\u044F. Markdown \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u0442\u0441\u044F \u0447\u0435\u0440\u0435\u0437 \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u043A\u043E\u043D\u0442\u0443\u0440 \u0438\u043C\u043F\u043E\u0440\u0442\u0430 WikiLive."
    });
  }
  async handleApiKeyValidation() {
    const trimmedKey = this.apiKey.trim();
    if (!trimmedKey) {
      throw new Error("\u0412\u0441\u0442\u0430\u0432\u044C API-\u043A\u043B\u044E\u0447 \u043F\u0435\u0440\u0435\u0434 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u043E\u0439");
    }
    this.plugin.settings.baseUrl = this.plugin.settings.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl;
    await this.plugin.saveSettings();
    this.isValidating = true;
    this.render();
    try {
      const spaces = await this.plugin.validateApiKey(trimmedKey);
      if (spaces.length === 0) {
        throw new Error("\u041A\u043B\u044E\u0447 \u0432\u0430\u043B\u0438\u0434\u0435\u043D, \u043D\u043E \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E");
      }
      this.plugin.saveApiKey(trimmedKey);
      this.spaces = spaces;
      this.selectedSpaceId = this.plugin.settings.selectedSpaceId || spaces[0].id;
      this.isApiKeyValid = true;
      new import_obsidian.Notice(`\u041A\u043B\u044E\u0447 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D. \u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432: ${spaces.length}`);
      this.render();
    } finally {
      this.isValidating = false;
    }
  }
  async handleImport() {
    const apiKey = this.plugin.getApiKey();
    if (!apiKey) {
      throw new Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0443\u043A\u0430\u0436\u0438 \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438 API-\u043A\u043B\u044E\u0447");
    }
    if (!this.selectedSpaceId) {
      throw new Error("\u0412\u044B\u0431\u0435\u0440\u0438 \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u043E WikiLive");
    }
    const files = await this.plugin.collectFiles(this.mode, this.folderPath, this.filePaths);
    this.plugin.settings.lastMode = this.mode;
    this.plugin.settings.lastFolderPath = this.folderPath;
    this.plugin.settings.lastFilePaths = this.filePaths;
    this.plugin.settings.selectedSpaceId = this.selectedSpaceId;
    await this.plugin.saveSettings();
    const preview = await this.plugin.previewImport({
      apiKey,
      spaceId: this.selectedSpaceId,
      mode: this.mode,
      folderStrategy: this.plugin.settings.folderStrategy,
      files
    });
    let conflictResolution = this.plugin.settings.defaultConflictResolution;
    if (preview.summary.conflicts > 0) {
      conflictResolution = await new ConflictResolutionModal(
        this.app,
        preview,
        this.plugin.settings.defaultConflictResolution
      ).openAndWait();
    }
    const result = await this.plugin.runImport({
      apiKey,
      spaceId: this.selectedSpaceId,
      mode: this.mode,
      folderStrategy: this.plugin.settings.folderStrategy,
      defaultConflictResolution: conflictResolution,
      files
    });
    new import_obsidian.Notice(`\u0418\u043C\u043F\u043E\u0440\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D: ${result.summary.imported} \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043E, ${result.summary.skipped} \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E`);
    this.close();
  }
};
var ConflictResolutionModal = class extends import_obsidian.Modal {
  constructor(app, preview, initialResolution) {
    super(app);
    this.preview = preview;
    this.settled = false;
    this.resolution = initialResolution;
  }
  openAndWait() {
    this.open();
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "\u041D\u0430\u0439\u0434\u0435\u043D\u044B \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u044B" });
    contentEl.createEl("p", {
      text: `${this.preview.summary.conflicts} \u0444\u0430\u0439\u043B\u043E\u0432 \u0441\u043E\u0432\u043F\u0430\u043B\u0438 \u0441 \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u043C\u0438 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430\u043C\u0438 \u0432 \u0446\u0435\u043B\u0435\u0432\u043E\u0439 \u043F\u0430\u043F\u043A\u0435.`
    });
    const list = contentEl.createEl("ul");
    this.preview.items.filter((item) => item.status === "conflict").slice(0, 12).forEach((item) => {
      list.createEl("li", {
        text: `${item.path} -> ${item.existingPageTitle || item.pageTitle}`
      });
    });
    new import_obsidian.Setting(contentEl).setName("\u0427\u0442\u043E \u0434\u0435\u043B\u0430\u0442\u044C \u0441 \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u0430\u043C\u0438").setDesc("\u0412\u044B\u0431\u0435\u0440\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0434\u043B\u044F \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u0438\u043C\u043F\u043E\u0440\u0442\u0430.").addDropdown(
      (dropdown) => dropdown.addOption("skip", "\u041F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u0443\u044E\u0449\u0438\u0435 \u0444\u0430\u0439\u043B\u044B").addOption("replace", "\u0417\u0430\u043C\u0435\u043D\u0438\u0442\u044C \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B").addOption("create_copy", "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043A\u043E\u043F\u0438\u0438").setValue(this.resolution).onChange((value) => {
        this.resolution = value;
      })
    );
    new import_obsidian.Setting(contentEl).addButton(
      (button) => button.setButtonText("\u041E\u0442\u043C\u0435\u043D\u0430").onClick(() => {
        this.settle("skip");
      })
    ).addButton(
      (button) => button.setCta().setButtonText("\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C").onClick(() => {
        this.settle(this.resolution);
      })
    );
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settle("skip");
    }
  }
  settle(value) {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.close();
    this.resolver?.(value);
  }
};
