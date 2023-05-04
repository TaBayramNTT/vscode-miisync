import * as vscode from "vscode";
import { readFilePropertiesService } from "../miiservice/readfilepropertiesservice.js";
import { readFileService } from "../miiservice/readfileservice.js";
import { configManager } from "../modules/config.js";
import { GetRemotePath, ValidatePath } from "../modules/file.js";
import { OpenTextDocument, ShowConfirmPreviewMessage } from "../modules/vscode.js";
import { filePropertiesTree } from "../ui/explorer/filepropertiestree.js";
import logger from "../ui/logger.js";
import { DownloadFile } from "./transfer/download.js";
import { UploadFile } from "./transfer/upload.js";
import path = require("path");


export async function OnDidSaveTextDocument(document: vscode.TextDocument) {
    const userConfig = await configManager.load();
    if (userConfig) {
        if (userConfig.uploadOnSave) { UploadFile(document.uri, document.getText(), userConfig, configManager.CurrentSystem); }
    }
    else {
        logger.warn('user config not available');
    }
}

export async function OnDidOpenTextDocument(document: vscode.TextDocument) {



}

export async function OnDidChangeActiveTextEditor(textEditor: vscode.TextEditor) {
    if (!textEditor) { return; }
    const document = textEditor.document;
    const userConfig = await configManager.load();
    if (userConfig) {
        const system = configManager.CurrentSystem;
        if (!await ValidatePath(document.fileName, userConfig)) { return; }
        const sourcePath = GetRemotePath(document.fileName, userConfig);
        const files = await readFilePropertiesService.call({ host: system.host, port: system.port }, sourcePath);
        if (files?.Rowsets?.Rowset?.Row) {
            const fileProp = files.Rowsets.Rowset.Row[0];
            filePropertiesTree.generateItems(fileProp);
            if (userConfig.downloadOnOpen) {
                DownloadFile(document.uri, userConfig, system);
            }
            else {
                const modifiedUser = fileProp.ModifiedBy;
                if (system.username != modifiedUser) {
                    const file = await readFileService.call({ host: system.host, port: system.port }, sourcePath);
                    const payload = file.Rowsets.Rowset.Row.find((row) => row.Name == "Payload");
                    const remoteContent = Buffer.from(payload.Value, 'base64').toString();
                    if (remoteContent != document.getText()) {
                        const response = await ShowConfirmPreviewMessage("This file has been modified by " + modifiedUser + " at " + fileProp.Modified + ". Do you want to download it? File: " + fileProp.ObjectName);
                        if (response === 1) {
                            DownloadFile(document.uri, userConfig, system);
                        }
                        else if (response === 2) {
                            const extension = path.extname(document.fileName).substring(1);
                            let language = extension == "js" ? "javascript" : extension;
                            OpenTextDocument(remoteContent, language, true);
                        }
                    }
                }
            }
        }
        else {
            filePropertiesTree.generateNotAvailable();
        }
    }
}