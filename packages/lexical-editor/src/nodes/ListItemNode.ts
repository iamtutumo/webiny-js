import {
    $isElementNode,
    $isRangeSelection,
    DOMConversionMap,
    DOMConversionOutput,
    EditorConfig,
    EditorThemeClasses,
    ElementNode,
    GridSelection,
    LexicalNode,
    NodeKey,
    NodeSelection,
    ParagraphNode,
    RangeSelection,
    SerializedElementNode
} from "lexical";
import { Spread } from "lexical";
import { $createListNode, $isListNode, ListNode } from "~/nodes/ListNode";
import { addClassNamesToElement, removeClassNamesFromElement } from "@lexical/utils";
import {
    $handleIndent,
    $handleOutdent,
    mergeLists,
    updateChildrenListItemValue
} from "~/nodes/ListNode/formatList";
import { $createParagraphNode, $isParagraphNode } from "~/nodes/ParagraphNode";
import { isNestedListNode } from "~/utils/nodes/listNode";

export type SerializedWebinyListItemNode = Spread<
    {
        checked: boolean | undefined;
        type: "webiny-listitem";
        value: number;
        version: 1;
    },
    SerializedElementNode
>;

/** @noInheritDoc */
export class ListItemNode extends ElementNode {
    /** @internal */
    __value: number;
    /** @internal */
    __checked?: boolean;

    static override getType(): string {
        return "webiny-listitem";
    }

    static override clone(node: ListItemNode): ListItemNode {
        return new ListItemNode(node.__value, node.__checked, node.__key);
    }

    constructor(value?: number, checked?: boolean, key?: NodeKey) {
        super(key);
        this.__value = value === undefined ? 1 : value;
        this.__checked = checked;
    }

    override createDOM(config: EditorConfig): HTMLElement {
        const element = document.createElement("li");
        const parent = this.getParent();

        if ($isListNode(parent)) {
            updateChildrenListItemValue(parent);
            updateListItemChecked(element, this, null, parent);
        }
        element.value = this.__value;
        $setListItemThemeClassNames(element, config.theme, this);

        return element;
    }

    override updateDOM(prevNode: ListItemNode, dom: HTMLElement, config: EditorConfig): boolean {
        const parent = this.getParent();

        if ($isListNode(parent)) {
            updateChildrenListItemValue(parent);
            updateListItemChecked(dom, this, prevNode, parent);
        }
        // @ts-expect-error - this is always HTMLListItemElement
        dom.value = this.__value;

        $setListItemThemeClassNames(dom, config.theme, this);

        return false;
    }

    static importDOM(): DOMConversionMap | null {
        return {
            li: () => ({
                conversion: convertListItemElement,
                priority: 0
            })
        };
    }

    static override importJSON(serializedNode: SerializedWebinyListItemNode): ListItemNode {
        const node = new ListItemNode(serializedNode.value, serializedNode.checked);
        node.setFormat(serializedNode.format);
        node.setIndent(serializedNode.indent);
        node.setDirection(serializedNode.direction);
        return node;
    }

    override exportJSON(): SerializedWebinyListItemNode {
        return {
            ...super.exportJSON(),
            checked: this.getChecked(),
            type: "webiny-listitem",
            value: this.getValue(),
            version: 1
        };
    }

    override append(...nodes: LexicalNode[]): this {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            if ($isElementNode(node) && this.canMergeWith(node)) {
                const children = node.getChildren();
                this.append(...children);
                node.remove();
            } else {
                super.append(node);
            }
        }

        return this;
    }

    override replace<N extends LexicalNode>(replaceWithNode: N, includeChildren?: boolean): N {
        if ($isListItemNode(replaceWithNode)) {
            return super.replace(replaceWithNode);
        }
        this.setIndent(0);
        const list = this.getParentOrThrow();
        if (!$isListNode(list)) {
            return replaceWithNode;
        }
        if (list.__first === this.getKey()) {
            list.insertBefore(replaceWithNode);
        } else if (list.__last === this.getKey()) {
            list.insertAfter(replaceWithNode);
        } else {
            // Split the list
            const newList = $createListNode(list.getListType());
            let nextSibling = this.getNextSibling();
            while (nextSibling) {
                const nodeToAppend = nextSibling;
                nextSibling = nextSibling.getNextSibling();
                newList.append(nodeToAppend);
            }
            list.insertAfter(replaceWithNode);
            replaceWithNode.insertAfter(newList);
        }
        if (includeChildren) {
            this.getChildren().forEach((child: LexicalNode) => {
                replaceWithNode.append(child);
            });
        }
        this.remove();
        if (list.getChildrenSize() === 0) {
            list.remove();
        }
        return replaceWithNode;
    }

    override insertAfter(node: LexicalNode): LexicalNode {
        const listNode = this.getParentOrThrow();

        if (!$isListNode(listNode)) {
            console.log("insertAfter: webiny list node is not parent of list item node");
            return listNode;
        }

        const siblings = this.getNextSiblings();

        if ($isListItemNode(node)) {
            const after = super.insertAfter(node);
            const afterListNode = node.getParentOrThrow();

            if ($isListNode(afterListNode)) {
                afterListNode;
            }

            return after;
        }

        // Attempt to merge if the list is of the same type.

        if ($isListNode(node) && node.getListType() === listNode.getListType()) {
            let child = node;
            const children = node.getChildren<ListNode>();

            for (let i = children.length - 1; i >= 0; i--) {
                child = children[i];

                this.insertAfter(child);
            }

            return child;
        }

        // Otherwise, split the list
        // Split the lists and insert the node in between them
        listNode.insertAfter(node);

        if (siblings.length !== 0) {
            const newListNode = $createListNode(listNode.getListType());

            siblings.forEach(sibling => newListNode.append(sibling));

            node.insertAfter(newListNode);
        }

        return node;
    }

    override remove(preserveEmptyParent?: boolean): void {
        const prevSibling = this.getPreviousSibling();
        const nextSibling = this.getNextSibling();
        super.remove(preserveEmptyParent);

        if (
            prevSibling &&
            nextSibling &&
            isNestedListNode(prevSibling) &&
            isNestedListNode(nextSibling)
        ) {
            mergeLists(prevSibling.getFirstChild(), nextSibling.getFirstChild());
            nextSibling.remove();
        } else if (nextSibling) {
            const parent = nextSibling.getParent();

            if ($isListNode(parent)) {
                updateChildrenListItemValue(parent);
            }
        }
    }

    override insertNewAfter(): ListItemNode | ParagraphNode {
        const newElement = $createListItemNode(this.__checked == null ? undefined : false);
        this.insertAfter(newElement);

        return newElement;
    }

    override collapseAtStart(selection: RangeSelection): true {
        const paragraph = $createParagraphNode();
        const children = this.getChildren();
        children.forEach(child => paragraph.append(child));
        const listNode = this.getParentOrThrow();
        const listNodeParent = listNode.getParentOrThrow();
        const isIndented = $isListItemNode(listNodeParent);

        if (listNode.getChildrenSize() === 1) {
            if (isIndented) {
                // if the list node is nested, we just want to remove it,
                // effectively unindenting it.
                listNode.remove();
                listNodeParent.select();
            } else {
                listNode.replace(paragraph);
                // If we have selection on the list item, we'll need to move it
                // to the paragraph
                const anchor = selection.anchor;
                const focus = selection.focus;
                const key = paragraph.getKey();

                if (anchor.type === "element" && anchor.getNode().is(this)) {
                    anchor.set(key, anchor.offset, "element");
                }

                if (focus.type === "element" && focus.getNode().is(this)) {
                    focus.set(key, focus.offset, "element");
                }
            }
        } else {
            listNode.insertBefore(paragraph);
            this.remove();
        }

        return true;
    }

    getValue(): number {
        const self = this.getLatest();

        return self.__value;
    }

    setValue(value: number): void {
        const self = this.getWritable();
        self.__value = value;
    }

    getChecked(): boolean | undefined {
        const self = this.getLatest();

        return self.__checked;
    }

    setChecked(checked?: boolean): void {
        const self = this.getWritable();
        self.__checked = checked;
    }

    toggleChecked(): void {
        this.setChecked(!this.__checked);
    }

    override getIndent(): number {
        // If we don't have a parent, we are likely serializing
        const parent = this.getParent();
        if (parent === null) {
            return this.getLatest().__indent;
        }
        // ListItemNode should always have a ListNode for a parent.
        let listNodeParent = parent.getParentOrThrow();
        let indentLevel = 0;
        while ($isListItemNode(listNodeParent)) {
            listNodeParent = listNodeParent.getParentOrThrow().getParentOrThrow();
            indentLevel++;
        }

        return indentLevel;
    }

    override setIndent(indent: number): this {
        let currentIndent = this.getIndent();
        while (currentIndent !== indent) {
            if (currentIndent < indent) {
                $handleIndent([this]);
                currentIndent++;
            } else {
                $handleOutdent([this]);
                currentIndent--;
            }
        }

        return this;
    }

    override canIndent(): false {
        // Indent/outdent is handled specifically in the RichText logic.

        return false;
    }

    override insertBefore(nodeToInsert: LexicalNode): LexicalNode {
        if ($isListItemNode(nodeToInsert)) {
            const parent = this.getParentOrThrow();

            if ($isListNode(parent)) {
                const siblings = this.getNextSiblings();
                updateChildrenListItemValue(parent, siblings);
            }
        }

        return super.insertBefore(nodeToInsert);
    }

    override canInsertAfter(node: LexicalNode): boolean {
        return $isListNode(node);
    }

    override canReplaceWith(replacement: LexicalNode): boolean {
        return $isListItemNode(replacement);
    }

    override canMergeWith(node: LexicalNode): boolean {
        return $isParagraphNode(node) || $isListItemNode(node);
    }

    override extractWithChild(
        child: LexicalNode,
        selection: RangeSelection | NodeSelection | GridSelection
    ): boolean {
        if (!$isRangeSelection(selection)) {
            return false;
        }

        const anchorNode = selection.anchor.getNode();
        const focusNode = selection.focus.getNode();

        return (
            this.isParentOf(anchorNode) &&
            this.isParentOf(focusNode) &&
            this.getTextContent().length === selection.getTextContent().length
        );
    }
}

function $setListItemThemeClassNames(
    dom: HTMLElement,
    editorThemeClasses: EditorThemeClasses,
    node: ListItemNode
): void {
    const classesToAdd = [];
    const classesToRemove = [];
    const listTheme = editorThemeClasses.list;
    const listItemClassName = listTheme ? listTheme.listitem : undefined;
    let nestedListItemClassName;

    if (listTheme && listTheme.nested) {
        nestedListItemClassName = listTheme.nested.listitem;
    }

    if (listItemClassName !== undefined) {
        const listItemClasses = listItemClassName.split(" ");
        classesToAdd.push(...listItemClasses);
    }

    if (listTheme) {
        const parentNode = node.getParent();
        const isCheckList = $isListNode(parentNode) && parentNode?.getListType() === "check";
        const checked = node.getChecked();

        if (!isCheckList || checked) {
            classesToRemove.push(listTheme.listitemUnchecked);
        }

        if (!isCheckList || !checked) {
            classesToRemove.push(listTheme.listitemChecked);
        }

        if (isCheckList) {
            classesToAdd.push(checked ? listTheme.listitemChecked : listTheme.listitemUnchecked);
        }
    }

    if (nestedListItemClassName !== undefined) {
        const nestedListItemClasses = nestedListItemClassName.split(" ");

        if (node.getChildren().some(child => $isListNode(child))) {
            classesToAdd.push(...nestedListItemClasses);
        } else {
            classesToRemove.push(...nestedListItemClasses);
        }
    }

    if (classesToRemove.length > 0) {
        removeClassNamesFromElement(dom, ...classesToRemove);
    }

    if (classesToAdd.length > 0) {
        addClassNamesToElement(dom, ...classesToAdd);
    }
}

function updateListItemChecked(
    dom: HTMLElement,
    listItemNode: ListItemNode,
    prevListItemNode: ListItemNode | null,
    listNode: ListNode
): void {
    const isCheckList = listNode.getListType() === "check";

    if (isCheckList) {
        // Only add attributes for leaf list items
        if ($isListNode(listItemNode.getFirstChild())) {
            dom.removeAttribute("role");
            dom.removeAttribute("tabIndex");
            dom.removeAttribute("aria-checked");
        } else {
            dom.setAttribute("role", "checkbox");
            dom.setAttribute("tabIndex", "-1");

            if (!prevListItemNode || listItemNode.__checked !== prevListItemNode.__checked) {
                dom.setAttribute("aria-checked", listItemNode.getChecked() ? "true" : "false");
            }
        }
    } else {
        // Clean up checked state
        if (listItemNode.getChecked() != null) {
            listItemNode.setChecked(undefined);
        }
    }
}

function convertListItemElement(): DOMConversionOutput {
    return { node: $createListItemNode() };
}

export function $createListItemNode(checked?: boolean): ListItemNode {
    return new ListItemNode(undefined, checked);
}

export function $isListItemNode(node: LexicalNode | null | undefined): node is ListItemNode {
    return node instanceof ListItemNode;
}
