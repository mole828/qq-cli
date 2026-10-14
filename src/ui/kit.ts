import { ChatPage as ClassicChatPage } from "./classic/ChatPage.js";
import { Composer as ClassicComposer } from "./classic/Composer.js";
import { EmptyState as ClassicEmptyState } from "./classic/EmptyState.js";
import { FacePanel as ClassicFacePanel } from "./classic/FacePanel.js";
import { ForwardPanel as ClassicForwardPanel } from "./classic/ForwardPanel.js";
import { HelpPanel as ClassicHelpPanel } from "./classic/HelpPanel.js";
import { MessageList as ClassicMessageList } from "./classic/MessageList.js";
import { SessionPicker as ClassicSessionPicker } from "./classic/SessionPicker.js";
import { ChatPage as QoderChatPage } from "./qoder/ChatPage.js";
import { Composer as QoderComposer } from "./qoder/Composer.js";
import { EmptyState as QoderEmptyState } from "./qoder/EmptyState.js";
import { FacePanel as QoderFacePanel } from "./qoder/FacePanel.js";
import { ForwardPanel as QoderForwardPanel } from "./qoder/ForwardPanel.js";
import { HelpPanel as QoderHelpPanel } from "./qoder/HelpPanel.js";
import { MessageList as QoderMessageList } from "./qoder/MessageList.js";
import { SessionPicker as QoderSessionPicker } from "./qoder/SessionPicker.js";
import { useUiStyle } from "./theme.js";

const classicKit = {
  ChatPage: ClassicChatPage,
  Composer: ClassicComposer,
  EmptyState: ClassicEmptyState,
  FacePanel: ClassicFacePanel,
  ForwardPanel: ClassicForwardPanel,
  HelpPanel: ClassicHelpPanel,
  MessageList: ClassicMessageList,
  SessionPicker: ClassicSessionPicker,
};

const qoderKit = {
  ChatPage: QoderChatPage,
  Composer: QoderComposer,
  EmptyState: QoderEmptyState,
  FacePanel: QoderFacePanel,
  ForwardPanel: QoderForwardPanel,
  HelpPanel: QoderHelpPanel,
  MessageList: QoderMessageList,
  SessionPicker: QoderSessionPicker,
};

export type UiKit = typeof classicKit;

export function useUiKit(): UiKit {
  const { style } = useUiStyle();
  return style === "qoder" ? qoderKit : classicKit;
}
