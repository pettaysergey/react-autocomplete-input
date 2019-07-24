import React from "react";
import PropTypes from "prop-types";
import { findDOMNode } from "react-dom";
import getCaretCoordinates from "textarea-caret";
import getInputSelection, { setCaretPosition } from "get-input-selection";
import "./AutoCompleteTextField.css";

const KEY_UP = 38;
const KEY_DOWN = 40;
const KEY_RETURN = 13;
const KEY_ENTER = 14;
const KEY_ESCAPE = 27;

const OPTION_LIST_Y_OFFSET = 10;
const OPTION_LIST_MIN_WIDTH = 100;

const propTypes = {
  Component: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
  defaultValue: PropTypes.string,
  disabled: PropTypes.bool,
  maxOptions: PropTypes.number,
  onBlur: PropTypes.func,
  onChange: PropTypes.func,
  onKeyDown: PropTypes.func,
  onRequestOptions: PropTypes.func,
  options: PropTypes.arrayOf(PropTypes.string),
  regex: PropTypes.string,
  matchAny: PropTypes.bool,
  minChars: PropTypes.number,
  requestOnlyIfNoOptions: PropTypes.bool,
  spaceRemovers: PropTypes.arrayOf(PropTypes.string),
  spacer: PropTypes.string,
  trigger: PropTypes.string,
  value: PropTypes.string,
  offsetX: PropTypes.number,
  offsetY: PropTypes.number,
  setFocusedFlag: PropTypes.func
};

const defaultProps = {
  Component: "textarea",
  defaultValue: "",
  disabled: false,
  maxOptions: 6,
  onBlur: () => {},
  onChange: () => {},
  onKeyDown: () => {},
  onRequestOptions: () => {},
  setFocusedFlag: () => {},
  options: [],
  regex: "^[A-Za-z0-9-А-Яа-я\\-_]+$",
  matchAny: false,
  minChars: 0,
  requestOnlyIfNoOptions: true,
  spaceRemovers: [",", ".", "!", "?"],
  spacer: " ",
  trigger: "@",
  offsetX: 0,
  offsetY: 0,
  value: null
};

class AutocompleteTextField extends React.Component {
  constructor(props) {
    super(props);

    this.isTrigger = this.isTrigger.bind(this);
    this.getMatch = this.getMatch.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleSelection = this.handleSelection.bind(this);
    this.updateCaretPosition = this.updateCaretPosition.bind(this);
    this.updateHelper = this.updateHelper.bind(this);
    this.resetHelper = this.resetHelper.bind(this);
    this.renderAutocompleteList = this.renderAutocompleteList.bind(this);
    this.scrollList = this.scrollList.bind(this);
    this.customOnChange = this.customOnChange.bind(this);
    this.customClick = this.customClick.bind(this);
    this.setErrorClick = this.setErrorClick.bind(this);
    this.setFocusedFlagHandler = this.setFocusedFlagHandler.bind(this);

    this.state = {
      helperVisible: false,
      left: 0,
      matchLength: 0,
      matchStart: 0,
      options: [],
      selection: 0,
      top: 0,
      value: null,
      // custom dropdown
      activeSuggestion: 0,
      filteredSuggestions: [],
      showSuggestions: false,
      scrollValue: 0
    };

    this.recentValue = props.defaultValue;
    this.enableSpaceRemovers = false;
  }

  componentDidMount() {
    // this.refInput.focus();
    // this.refInput.setSelectionRange(2, 5);
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("keydown", event => {
      if (this.state.helperVisible || this.state.showSuggestions) {
        switch (event.keyCode) {
          case KEY_ESCAPE:
            event.preventDefault();
            this.setState({ helperVisible: false, showSuggestions: false });
            break;
          default:
            break;
        }
      }
    });
  }

  componentWillReceiveProps(nextProps) {
    const { options } = this.props;
    const { caret } = this.state;

    if (options.length !== nextProps.options.length) {
      this.updateHelper(this.recentValue, caret, nextProps.options);
    }
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.handleResize);
  }

  getMatch(str, caret, providedOptions) {
    const { trigger, matchAny, regex } = this.props;
    const re = new RegExp(regex);
    const triggerLength = trigger.length;
    const triggerMatch = trigger.match(re);

    for (let i = caret - 1; i >= 0; --i) {
      const substr = str.substring(i, caret);
      const match = substr.match(re);
      let matchStart = -1;

      if (triggerLength > 0) {
        const triggerIdx = triggerMatch ? i : i - triggerLength + 1;

        if (triggerIdx < 0) {
          // out of input
          return null;
        }

        if (this.isTrigger(str, triggerIdx)) {
          matchStart = triggerIdx + triggerLength;
        }

        if (!match && matchStart < 0) {
          return null;
        }
      } else {
        if (match && i > 0) {
          // find first non-matching character or begin of input
          continue;
        }
        matchStart = i === 0 && match ? 0 : i + 1;

        if (caret - matchStart === 0) {
          // matched slug is empty
          return null;
        }
      }

      if (matchStart >= 0) {
        const matchedSlug = str.substring(matchStart, caret);
        const options = providedOptions.filter(slug => {
          const idx = slug.toLowerCase().indexOf(matchedSlug);
          return idx !== -1 && (matchAny || idx === 0);
        });

        const matchLength = matchedSlug.length;

        return { matchStart, matchLength, options };
      }
    }

    return null;
  }

  isTrigger(str, i) {
    const { trigger } = this.props;

    if (!trigger || !trigger.length) {
      return true;
    }

    if (str.substr(i, trigger.length) === trigger) {
      return true;
    }

    return false;
  }

  handleChange(e) {
    const { onChange, options, spaceRemovers, spacer, value } = this.props;
    const old = this.recentValue;
    const str = e.target.value;
    const caret = getInputSelection(e.target).end;
    this.customOnChange(str);
    if (!str.length) {
      this.setState({ helperVisible: false });
    }

    this.recentValue = str;

    this.setState({ caret, value: e.target.value });

    if (!str.length || !caret) {
      return onChange(e.target.value);
    }

    // '@wonderjenny ,|' -> '@wonderjenny, |'
    if (
      this.enableSpaceRemovers &&
      spaceRemovers.length &&
      str.length > 2 &&
      spacer.length
    ) {
      for (let i = 0; i < Math.max(old.length, str.length); ++i) {
        if (old[i] !== str[i]) {
          if (
            i >= 2 &&
            str[i - 1] === spacer &&
            spaceRemovers.indexOf(str[i - 2]) === -1 &&
            spaceRemovers.indexOf(str[i]) !== -1 &&
            this.getMatch(
              str.substring(0, i - 2).toLowerCase(),
              caret - 3,
              options
            )
          ) {
            const newValue = `${str.slice(0, i - 1)}${str.slice(
              i,
              i + 1
            )}${str.slice(i - 1, i)}${str.slice(i + 1)}`;

            this.updateCaretPosition(i + 1);
            findDOMNode(this.refInput).value = newValue;

            if (!value) {
              this.setState({ value: newValue });
            }
            return onChange(newValue);
          }

          break;
        }
      }

      this.enableSpaceRemovers = false;
    }

    this.updateHelper(str, caret, options);

    if (!value) {
      this.setState({ value: e.target.value });
    }

    return onChange(e.target.value);
  }

  // for customDropdown
  customOnChange(value) {
    const { options } = this.props;
    const filteredSuggestions = options.filter(
      suggestion => suggestion.toLowerCase().indexOf(value.toLowerCase()) > -1
    );

    this.setState({
      activeSuggestion: 0,
      filteredSuggestions,
      showSuggestions: true,
      value
    });
  }

  handleKeyDown(event) {
    const {
      helperVisible,
      options,
      selection,
      showSuggestions,
      activeSuggestion,
      filteredSuggestions
    } = this.state;
    const { onKeyDown } = this.props;

    if (helperVisible) {
      switch (event.keyCode) {
        case KEY_ESCAPE:
          event.preventDefault();
          this.resetHelper();
          break;
        case KEY_UP:
          event.preventDefault();
          this.setState(
            {
              selection: (options.length + selection - 1) % options.length
            },
            () => this.scrollList("up")
          );
          break;
        case KEY_DOWN:
          event.preventDefault();
          this.setState({ selection: (selection + 1) % options.length }, () =>
            this.scrollList("down")
          );
          break;
        case KEY_ENTER:
        case KEY_RETURN:
          event.preventDefault();
          this.handleSelection(selection);
          break;
        default:
          onKeyDown(event);
          break;
      }
    } else {
      onKeyDown(event);
    }

    // for custom dropdown
    if (showSuggestions) {
      switch (event.keyCode) {
        case KEY_RETURN:
          event.preventDefault();
          if (filteredSuggestions[activeSuggestion] && this.state.value) {
            this.setState({
              activeSuggestion: 0,
              showSuggestions: false,
              filteredSuggestions: []
            });
            this.props.onChange(filteredSuggestions[activeSuggestion]);
            this.refInput.focus();
          }
          break;
        case KEY_DOWN:
          if (activeSuggestion - 1 === filteredSuggestions.length) {
            return;
          }
          if (activeSuggestion === filteredSuggestions.length - 1) {
            this.setState({ activeSuggestion: 0 });
            return;
          }
          this.setState({ activeSuggestion: activeSuggestion + 1 });
          break;
        case KEY_UP:
          if (activeSuggestion === 0) {
            this.setState({ activeSuggestion: filteredSuggestions.length - 1 });
            return;
          }
          if (activeSuggestion)
            this.setState({ activeSuggestion: activeSuggestion - 1 });
          break;
        default:
          break;
      }
    }
  }

  scrollList(duration) {
    const { selection, options } = this.state;
    const list = this.refList;
    const listHeight = list.getBoundingClientRect().height;
    const item = list.querySelector(".active");
    const itemTop = item.getBoundingClientRect().top;
    const itemHeight = item.getBoundingClientRect().height;
    const inputBLock =
      this.refInput.getBoundingClientRect().top +
      this.refInput.getBoundingClientRect().height;
    // down
    if (duration === "down") {
      if (selection === 0) {
        this.setState(
          { scrollValue: 0 },
          () => (list.scrollTop = this.state.scrollValue)
        );
      } else {
        if (itemTop >= listHeight + inputBLock) {
          this.setState(
            { scrollValue: this.state.scrollValue + itemHeight },
            () => (list.scrollTop = this.state.scrollValue)
          );
        }
      }
    }
    //top
    else {
      if (selection === options.length - 1) {
        this.setState(
          { scrollValue: itemHeight * options.length - listHeight + 4 },
          () => (list.scrollTop = this.state.scrollValue)
        );
      } else {
        if (itemTop <= inputBLock) {
          this.setState(
            { scrollValue: this.state.scrollValue - itemHeight },
            () => (list.scrollTop = this.state.scrollValue)
          );
        }
      }
    }
  }

  handleResize() {
    this.setState({ helperVisible: false });
  }

  handleSelection(idx) {
    const { matchStart, matchLength, options } = this.state;
    const { spacer } = this.props;

    const slug = options[idx];
    const value = this.recentValue;
    const part1 = value.substring(0, matchStart);
    const part2 = value.substring(matchStart + matchLength);

    const event = { target: findDOMNode(this.refInput) };

    event.target.value = `${part1}${slug}${spacer}${part2}`;
    this.handleChange(event);

    this.resetHelper();

    this.updateCaretPosition(part1.length + slug.length + 1);

    this.enableSpaceRemovers = true;
  }

  customClick(e) {
    this.setState({
      activeSuggestion: 0,
      filteredSuggestions: [],
      showSuggestions: false
      // value: e.currentTarget.innerText
    });
    this.props.onChange(e.currentTarget.innerText);
    this.refInput.focus();
  }

  setErrorClick() {
    const { column } = this.props;
    if (column) {
      this.refInput.selectionStart = column;
      this.refInput.selectionEnd = column;
    }
  }

  updateCaretPosition(caret) {
    this.setState({ caret }, () =>
      setCaretPosition(findDOMNode(this.refInput), caret)
    );
  }

  updateHelper(str, caret, options) {
    const input = findDOMNode(this.refInput);
    const slug = this.getMatch(str.toLowerCase(), caret, options);

    if (slug) {
      const caretPos = getCaretCoordinates(input, caret);
      const rect = input.getBoundingClientRect();

      const top = caretPos.top + input.offsetTop;
      const left = Math.min(
        caretPos.left + input.offsetLeft - OPTION_LIST_Y_OFFSET,
        input.offsetLeft + rect.width - OPTION_LIST_MIN_WIDTH
      );

      const { minChars, onRequestOptions, requestOnlyIfNoOptions } = this.props;

      if (
        slug.matchLength >= minChars &&
        (slug.options.length > 1 ||
          (slug.options.length === 1 &&
            slug.options[0].length !== slug.matchLength))
      ) {
        this.setState({
          helperVisible: true,
          top,
          left,
          ...slug
        });
      } else {
        if (!requestOnlyIfNoOptions || !slug.options.length) {
          onRequestOptions(str.substr(slug.matchStart, slug.matchLength));
        }

        this.resetHelper();
      }
    } else {
      this.resetHelper();
    }
  }

  resetHelper() {
    this.setState({ helperVisible: false, selection: 0 });
  }

  renderAutocompleteList() {
    const {
      helperVisible,
      left,
      matchStart,
      matchLength,
      options,
      selection,
      top,
      value
    } = this.state;

    if (!helperVisible) {
      return null;
    }

    const { maxOptions, offsetX, offsetY } = this.props;

    if (options.length === 0) {
      return null;
    }

    if (selection >= options.length) {
      this.setState({ selection: 0 });

      return null;
    }

    const optionNumber = maxOptions === 0 ? options.length : maxOptions;

    const helperOptions = options.slice(0, optionNumber).map((val, idx) => {
      const highlightStart = val
        .toLowerCase()
        .indexOf(value.substr(matchStart, matchLength).toLowerCase());

      return (
        <li
          className={idx === selection ? "active" : null}
          key={val + idx}
          onClick={() => {
            this.handleSelection(idx);
          }}
          // onMouseEnter={() => {
          //   this.setState({ selection: idx });
          // }}
        >
          {val.slice(0, highlightStart)}
          <strong>{val.substr(highlightStart, matchLength)}</strong>
          {val.slice(highlightStart + matchLength)}
        </li>
      );
    });

    return (
      <ul
        className="react-autocomplete-input"
        style={{ left: left + offsetX, top: top + offsetY }}
        ref={c => {
          this.refList = c;
        }}
      >
        {helperOptions}
      </ul>
    );
  }

  setFocusedFlagHandler(value) {
    const { setFocusedFlag } = this.props;
    value === "focus" ? setFocusedFlag(true) : setFocusedFlag(false);
  }

  render() {
    const {
      Component,
      defaultValue,
      disabled,
      onBlur,
      value,
      ...rest
    } = this.props;

    const {
      value: stateValue, // customDropdown
      activeSuggestion,
      filteredSuggestions,
      showSuggestions
    } = this.state;

    const propagated = Object.assign({}, rest);
    Object.keys(this.constructor.propTypes).forEach(k => {
      delete propagated[k];
    });

    let val = "";

    if (typeof value !== "undefined" && value !== null) {
      val = value;
    } else if (stateValue) {
      val = stateValue;
    } else if (defaultValue) {
      val = defaultValue;
    }

    //customDropdown
    let suggestionsListComponent = () => {
      if (showSuggestions && value) {
        if (filteredSuggestions.length) {
          return (
            <ul className="react-autocomplete-input">
              {filteredSuggestions.map((suggestion, index) => {
                let className;

                // Flag the active suggestion with a class
                if (index === activeSuggestion) {
                  className = "active";
                }

                return (
                  <li
                    className={className}
                    key={suggestion + index}
                    onClick={e => this.customClick(e, index)}
                  >
                    {suggestion}
                  </li>
                );
              })}
            </ul>
          );
        }
      }
    };

    return (
      <span>
        <Component
          disabled={disabled}
          onBlur={() => this.setFocusedFlagHandler("blur")}
          onFocus={() => this.setFocusedFlagHandler("focus")}
          onChange={this.handleChange}
          onKeyDown={this.handleKeyDown}
          ref={c => {
            this.refInput = c;
          }}
          value={val}
          // custom click for set cursor if has error
          onClick={this.setErrorClick}
          {...propagated}
        />
        {this.renderAutocompleteList()}
        {suggestionsListComponent()}
      </span>
    );
  }
}

AutocompleteTextField.propTypes = propTypes;
AutocompleteTextField.defaultProps = defaultProps;

export default AutocompleteTextField;
