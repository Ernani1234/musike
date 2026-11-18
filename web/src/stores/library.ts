import { getT } from "../i18n";
import { api } from "../lib/api";
import { createLibraryStore } from "./libraryState";
import { toast } from "./ui";

export const useLibrary = createLibraryStore(api, getT, toast);
