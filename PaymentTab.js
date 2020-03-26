import React from "react";
import { IconButton, Button, Tab } from "@twilio/flex-ui";

import { PaymentForm } from "./PaymentForm";
import { ApplePayIcon } from "./PayIcon";
import { Actions, TaskHelper, StateHelper } from "@twilio/flex-ui";

import styled, { keyframes } from "react-emotion";

import SyncClient from "twilio-sync";

export class PaymentTab extends React.Component {
  INIT_PAY_FUNCTION = "";
  SYNC_TOKEN_FUNCTION = "";
  SEND_SMS_FUNCTION = "";

  constructor(props) {
    super(props);
    this.state = {
      cardName: "",
      cardNumber: "",
      cardIssuer: "",
      cardExpiry: "",
      cardCvc: "",
      paymentToken: "",
      postalCode: "",
      focused: "",
      session: "",
      error: null
    };
    this.INIT_PAY_FUNCTION = this.getRuntimeDomain() + "/InitPay";
    this.SYNC_TOKEN_FUNCTION = this.getRuntimeDomain() + "/SyncToken";
    this.SEND_SMS_FUNCTION = this.getRuntimeDomain() + "/SendSMS";
    this.getToken("ckendall", this.initDatasync);
  }

  getRuntimeDomain = () => {
    let runtime = this.props.functionsUrl.replace(/(\/assets)?\/?$/, "");
    return runtime.match(/^https?/) ? runtime :  "https://"+runtime;
  };

  paySessionUpdate = update => {
    console.log("*** pay session updated: " + JSON.stringify(update.item.descriptor));
    const { data } = update.item.descriptor;
    if (data.errorType) {
      this.showError(data.for, data.errorType, data.attempt);
      return;
    }
    if (data.paymentToken) {
      this.setState({ session: "complete", paymentToken: data.paymentToken, focused: "" });
    }
    if (data.for === "payment-card-number") {
      this.setState({
        cardIssuer: data.paymentCardType.replace(/-/g, ""),
        cardNumber: data.paymentCardNumber.replace(/x/g, "*"),
        focused: "expiry",
        error: null
      });
    } else if (data.for === "expiration-date") {
      this.setState({
        cardExpiry: data.expirationDate,
        focused: "cvc",
        error: null
      });
    } else if (data.for === "postal-code") {
      this.setState({
        postalCode: data.paymentCardPostalCode,
        focused: "cvc",
        error: null
      });
    } else if (data.for === "security-code") {
      this.setState({
        cardCvc: data.securityCode,
        focused: "token",
        error: null
      });
    }
  };

  showError = (errorFor, errorType, attempts) => {
    const payFieldMap = {
      "payment-card-number": "number",
      "expiration-date": "expiry",
      "postal-code": "postalCode",
      "security-code": "cvc"
    };
    if (errorFor || errorType) {
      this.setState({
        error: {
          for: payFieldMap[errorFor],
          description: errorType,
          failures: attempts
        }
      });
    }
  };

  initDatasync = data => {
    let options = {
      logLevel: "debug"
    };
    let client = new SyncClient(data.token, options);

    client.on("connectionStateChanged", state => {
      console.log("Connection state: ", state);
    });

    client.map("PaySessions").then(map => {
      map.on("itemAdded", this.paySessionUpdate);
      map.on("itemUpdated", this.paySessionUpdate);
    });

    client.map("ApplePaySessions").then(map => {
      map.on("itemAdded", this.applePayAdded);
    });
  };

  applePayAdded = added => {
    console.log(added.item);
    const { data } = added.item.descriptor;
    if (data.token.id && data.token.card && data.payerEmail) {
      this.setState({
        session: "complete",
        cardName: data.payerEmail,
        paymentToken: data.token.id,
        cardIssuer: data.token.card.brand.replace(/ /g, ""),
        cardNumber: data.token.card.last4.padStart(16, "*"),
        cardExpiry:
          String(data.token.card.exp_month) + String(data.token.card.exp_year).substring(2, 4),
        postalCode: data.token.card.address_zip,
        cardCvc: "***",
        focused: "token",
        error: null
      });
    }
  };

  getToken(identity, handler) {
    fetch(this.SYNC_TOKEN_FUNCTION + "?Identity=" + identity, {
      headers: {
        Accept: "application/json"
      },
      mode: "cors"
    })
      .then(resp => {
        console.log("Status", resp.status);
        return resp.json();
      })
      .then(json => {
        console.log("SyncToken", json.token);
        handler(json);
      });
  }

  initPay(callSid, agentCallSid, conferenceSid, from, taskSid) {
    console.info("*** initPay", callSid, agentCallSid, conferenceSid, from, taskSid);
    fetch(
      this.INIT_PAY_FUNCTION +
        "?CallSid=" +
        callSid +
        "&AgentCallSid=" +
        agentCallSid +
        "&ConferenceSid=" +
        conferenceSid +
        "&TaskSid=" +
        taskSid +
        "&From=" +
        encodeURIComponent(from),
      {
        headers: {
          Accept: "application/json"
        },
        mode: "cors"
      }
    ).then(resp => {
      console.log("Status", resp.status);
      if (resp.ok) {
        this.setState({ session: callSid, focused: "number" });
      }
    });
    return null;
  }

  initApplePay(taskSid, toNumber) {
    const Body =
      "You can pay via ApplePay or CreditCard via this link: https://www.kickflip-boards.store/apple-pay/";

    if (TaskHelper.isChatBasedTask(this.props.task.source)) {
      Actions.addListener("afterSendMessage", payload => {
        if (
          payload.channelSid === TaskHelper.getTaskChatChannelSid(this.props.task.source) &&
          payload.body === Body
        ) {
          this.setState({ session: taskSid, focused: "number" });
        }
      });
      Actions.invokeAction("SendMessage", {
        channel: StateHelper.getChatChannelStateForTask(this.props.task.source),
        channelSid: TaskHelper.getTaskChatChannelSid(this.props.task.source),
        body: Body
      });
    } else {
      fetch(
        this.SEND_SMS_FUNCTION +
          "?To=" +
          encodeURIComponent(toNumber) +
          "&Body=" +
          encodeURIComponent(Body),
        {
          headers: {
            Accept: "application/json"
          },
          mode: "cors"
        }
      ).then(resp => {
        if (resp.ok) {
          this.setState({ session: taskSid, focused: "number" });
        }
      });
    }
  }

  render() {
    const anim = keyframes`
        0%{background-position:0% 82%}
        100%{background-position:100% 19%}
    }`;

    // const RainbowProgressBar = styled("hr")`
    //   height: 3px;
    //   width: 100%;
    //   filter: contrast(1.5) saturate(1.5);
    //   background: repeating-linear-gradient(
    //     124deg,
    //     #223758 0%,
    //     #00b9f0 20%,
    //     #ed3247 30%,
    //     #ec3192 40%,
    //     #04b16c 50%,
    //     #fff353 60%,
    //     #593a96 70%,
    //     #ec3192 80%,
    //     #ed3247 90%,
    //     #00b9f0 100%
    //   );
    //   background-size: 200% 200%;
    //   animation: ${anim} 3s linear infinite alternate;
    // `;

    const ProgressBar = styled("hr")`
      height: 5px;
      width: 100%;
      background: linear-gradient(
        124deg,
        rgba(0, 156, 255, 0.2) 30%,
        rgba(0, 156, 255, 1) 50%,
        rgba(0, 156, 255, 0.2) 70%
      );
      background-size: 200% 200%;
      animation: ${anim} 2s linear infinite alternate;
    `;

    let customerName = "TEST CUSTOMER";
    let debug = false;
    let session, taskInfo;
    if (this.props.task.source) {
      if (this.props.task.source.attributes.name || this.props.task.source.attributes.from) {
        customerName =
          this.props.task.source.attributes.name || this.props.task.source.attributes.from;
      }
      debug = this.props.task.source.attributes.debug;
      taskInfo = {
        from: this.props.task.source.attributes.from || this.props.task.source.attributes.identity,
        taskSid: this.props.task.source.sid
      };
      if (
        this.props.task.source.taskChannelUniqueName === "voice" &&
        this.props.task.source.status === "assigned"
      ) {
        taskInfo = {
          ...taskInfo,
          conference: this.props.task.source.attributes.conference.sid,
          callSid: this.props.task.source.attributes.conference.participants.customer,
          agentCallSid: this.props.task.source.attributes.conference.participants.worker
        };
      }
      if (this.state.session) {
        session = Object.entries(taskInfo).map(item => (
          <li key={item[0]}>
            <h2>{String(item[0]).toUpperCase()}:</h2>
            <div>{String(item[1])}</div>
          </li>
        ));
      }
    }

    const Container = styled("div")`
      display: flex;
      flex-direction: column;
      flex: 1 0 auto;
      border-style: solid;
      border-width: 0 0 0 0px;
      iframe {
        border: none;
        display: flex;
        flex: 1 0 auto;
      }
    `;

    return (
      <Tab>
      <Container>
        <div style={{ margin: "1em" }}>
          <div>
            <h1 style={{ letterSpacing: "2px" }}>
              <code>{"Agent Assisted Payments"}</code>
            </h1>
            {this.props.task.source.taskChannelUniqueName === "voice" && (
              <div>
                <p>Instruct customers to use their telephone keypad to enter credit card data</p>
                <p>When ready, click 'Start Payment' to begin</p>
              </div>
            )}
            {this.props.task.source.taskChannelUniqueName !== "voice" && (
              <div>
                <p>You can send Apple Pay via SMS or connected messaging service</p>
                <p>
                  Instruct customers to open the web link in the message and click Apple Pay or
                  enter a credit card
                </p>
              </div>
            )}
          </div>
          {this.state.session &&
            !(this.state.error && this.state.error.failures >= 3) &&
            !this.state.paymentToken && (
              <div>
                <h1 style={{ letterSpacing: "2px" }}>Active session:</h1>
                <ProgressBar style={{ borderStyle: "none", marginBottom: "2em" }} />
              </div>
            )}
          {!this.state.session && <hr style={{ marginBottom: "1em" }} />}
          <div style={{ display: "flex", flexDirection: "row" }}>
            <div style={{ padding: "1em" }}>
              <div>
                <h1 style={{ letterSpacing: "2px" }}>Amount</h1>
                <p>
                  <code>$135.00</code>
                </p>
              </div>
              {this.props.task.source &&
                this.props.task.source.status === "assigned" &&
                this.props.task.source.taskChannelUniqueName === "voice" &&
                !this.state.session && (
                  <div style={{ marginTop: "2em" }}>
                    <Button
                      style={{
                        borderRadius: "5px",
                        minWidth: "160px",
                        minHeight: "32px",
                        maxHeight: "64px",
                        backgroundColor: "forestgreen",
                        color: "white"
                      }}
                      onClick={() => {
                        this.initPay(
                          taskInfo.callSid,
                          taskInfo.agentCallSid,
                          taskInfo.conference,
                          taskInfo.from,
                          taskInfo.taskSid
                        );
                      }}
                    >
                      START PAYMENT
                    </Button>
                  </div>
                )}
              {!this.state.session &&
                this.props.task.source &&
                this.props.task.source.attributes.applePay && (
                  <div style={{ marginTop: "2em" }}>
                    <IconButton
                      onClick={() => this.initApplePay(taskInfo.taskSid, taskInfo.from)}
                      sizeMultiplier="1.5"
                      style={{
                        borderRadius: "5px",
                        minWidth: "160px",
                        minHeight: "32px",
                        maxHeight: "64px",
                        backgroundColor: `white`,
                        color: `black`,
                        backgroundSize: "100% 50%"
                      }}
                      icon={<ApplePayIcon />}
                    />
                  </div>
                )}
              {this.state.session && (
                <PaymentForm
                  name={customerName}
                  number={this.state.cardNumber}
                  issuer={this.state.cardIssuer}
                  expiry={this.state.cardExpiry}
                  postalCode={this.state.postalCode}
                  cvc={this.state.cardCvc}
                  token={this.state.paymentToken}
                  focused={this.state.focused}
                  error={this.state.error}
                />
              )}
            </div>
            <div style={{ padding: "1em" }}>
              <br />
              {debug &&
                session && (
                  <div style={{ wordBreak: "break-word" }}>
                    <ul>{session}</ul>
                  </div>
                )}
            </div>
          </div>
        </div>
      </Container>
      </Tab>
    );
  }
}
