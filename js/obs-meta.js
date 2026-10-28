/* 观测数据元信息 —— 由 工具/发布数据.py 生成，请勿手工编辑。
 *
 * 单独成文件是为了让首屏不必下载整份观测数据。
 * meta.public / meta.full 分别是公开窗口与完整数据集的规模，
 * 解锁提示条用它们显示「现在给你看多少、完整的有多少」。
 */

var OBS_META = {
  "source": "measured",
  "generatedAt": "2026-10-28T13:21:09+08:00",
  "timezoneOffsetMin": 480,
  "units": {
    "sap_flux_density": "g m-2 s-1",
    "stem_radius": "um"
  },
  "span": [
    1792510200000,
    1793115000000
  ],
  "trees": 20,
  "points": 13128,
  "radialFaults": [
    {
      "treeId": "DT3-LYS1-1150",
      "since": 1789372800000,
      "quality": "suspect",
      "description": "09-14 16:00 起读数在 0 与 175.926mm 之间乱跳、之后固定在 175.9mm，疑似回绕，按 175.926mm 订正后仍标异常，等待现场核实",
      "displayCorrection": {
        "type": "inferredWrap",
        "periodUm": 175926.0,
        "since": 1789372800000
      }
    }
  ],
  "public": {
    "days": 7,
    "since": 1792510200000,
    "points": 13128
  }
};
