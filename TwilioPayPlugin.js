import { getRuntimeUrl, FlexPlugin } from "flex-plugin";
import React from "react";

import { PaymentTab } from "./PaymentTab";
import { PayIcon, PayIconActive } from "./PayIcon";

export default class TwilioPayPlugin extends FlexPlugin {
  pluginName = "TwilioPayPlugin";

  init(flex, manager) {
    const functionsUrl = manager.configuration.functionsUrl
      ? manager.configuration.functionsUrl
      : getRuntimeUrl();
    flex.TaskCanvasTabs.Content.add(
      <PaymentTab
        key="payment-tab"
        functionsUrl={functionsUrl}
        icon={<PayIcon />}
        iconActive={<PayIconActive />}
        visible
      />,
      { if: props => !!props.task }
    );
  }
}
