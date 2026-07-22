#!/usr/bin/env node

import process from "node:process";
import { main } from "../lib/application.mjs";

process.exitCode = main();
