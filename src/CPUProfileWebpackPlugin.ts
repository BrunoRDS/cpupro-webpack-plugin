import type { Compiler as WebpackCompiler } from "webpack";
import type { Compiler as Webpack4Compiler } from "webpack4";
import path from "path";
import { promisify } from "util";
import inspector from "inspector";

export interface CPUProfileWebpackPluginOptions {
  profileName?: string;
  outputPath?: string;
}

const PluginName = "CPUProfileWebpackPlugin";

export class CPUProfileWebpackPlugin {
  private readonly session: inspector.Session;
  private readonly profileName: string;

  constructor(private readonly options: CPUProfileWebpackPluginOptions = {}) {
    this.session = new inspector.Session();
    this.session.connect();
    this.profileName = options.profileName ?? "webpack";
  }

  apply(compiler: WebpackCompiler): void {
    const webpackCompiler: Webpack4Compiler | WebpackCompiler = compiler as
      | Webpack4Compiler
      | WebpackCompiler;

    const fs = webpackCompiler.outputFileSystem;
    const writeFile = promisify(fs.writeFile);
    const logger = webpackCompiler.getInfrastructureLogger(PluginName);

    let outputPath: string | undefined = this.options.outputPath;
    if (!outputPath) {
      const compilationOutputPath: string | undefined =
        webpackCompiler.options.output?.path;
      if (!compilationOutputPath) {
        throw new Error(
          `If an explicit "outputPath" is not passed to the ${CPUProfileWebpackPlugin.name} plugin's ` +
            "constructor's options object, the output.path property must be set in the webpack configuration."
        );
      }

      outputPath = path.resolve(compilationOutputPath, "webpack.cpuprofile");
    }

    logger.warn(`Starting CPU Profile: ${this.profileName}`);
    const cpuProfilerEnable = promisify(
      this.session.post.bind<inspector.Session, "Profiler.enable", never, void>(
        this.session,
        "Profiler.enable"
      )
    );
    const cpuProfilerStart = promisify(
      this.session.post.bind<inspector.Session, "Profiler.start", never, void>(
        this.session,
        "Profiler.start"
      )
    );
    logger.warn(`Mark 1: ${this.profileName}`);
    const cpuProfilerStop = promisify(
      this.session.post.bind<
        inspector.Session,
        "Profiler.stop",
        never,
        inspector.Profiler.StopReturnType | void
      >(this.session, "Profiler.stop")
    );

    const profileStartPromise = cpuProfilerEnable().then(() => {
      try{
        logger.warn(`In profiler start try block: ${this.profileName}`);
        return cpuProfilerStart();
      } catch (e) {
        logger.error(`CPU Profile plugine encountered an error: ${e}`);
      }

    });

    webpackCompiler.hooks.done.tapPromise(PluginName, async () => {
      logger.warn(`Done Hook Block: ${this.profileName}`);
      await profileStartPromise;

      try {
        logger.warn(`Try Block in Done Hook: ${this.profileName}`);
        const profile =
          (await cpuProfilerStop()) as inspector.Profiler.StopReturnType;

        if (!profile) {
          throw new Error("output did not contain profile information");
        }

        await writeFile(outputPath!, JSON.stringify(profile.profile));
        logger.warn(`CPU Profile written to: ${outputPath}`);
      } catch (e) {
        logger.error(`CPU Profile plugine encountered an error: ${e}`);
      }
    });

    webpackCompiler.hooks.watchRun.tapPromise(PluginName, async () => {
      logger.warn(`Starting CPU Profile (On Watch Hook): ${this.profileName}`);
      try{
        logger.warn(`Trying Start: ${this.profileName}`);
        await profileStartPromise;
      } catch (e) {
        logger.error(`CPU Profile Failed to start: ${e}`);
      }
      logger.warn(`after await (On Watch Hook): ${this.profileName}`);
    });

    // webpackCompiler.hooks.watchClose.tapPromise(PluginName, async () => {
    //   await profileStartPromise;

    //   try {
    //     const profile =
    //       (await cpuProfilerStop()) as inspector.Profiler.StopReturnType;

    //     if (!profile) {
    //       throw new Error("output did not contain profile information");
    //     }

    //     await writeFile(outputPath!, JSON.stringify(profile.profile));
    //     logger.info(`CPU Profile written to: ${outputPath}`);
    //   } catch (e) {
    //     logger.error(`CPU Profile plugine encountered an error: ${e}`);
    //   }
    // });

  }
}
